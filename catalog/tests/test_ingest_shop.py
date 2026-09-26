"""Shop-sheet parsing and dry-run tests; no database or network."""
import csv
from decimal import Decimal

import pytest

import ingest_shop as shop


BASE = dict(sku="001", name="Armchair", category="chair", width="120 см",
            depth="80 cm", height="85", price="85 000 ֏")
PERMISSION = "written permission 2026-09-26 — shop owner"


@pytest.mark.parametrize("headers", [
    [" SKU ", "NAME", "Category", "Width (cm)", "Depth", "Height", "Price AMD"],
    ["АРТИКУЛ", "Название", "Категория", "Ширина (см)", "Глубина", "Высота", "Цена"],
    ["ԱՐՏԻԿՈՒԼ", "ԱՆՎԱՆՈՒՄ", "ԿԱՏԵԳՈՐԻԱ", "ԼԱՅՆՈՒԹՅՈՒՆ", "ԽՈՐՈՒԹՅՈՒՆ", "ԲԱՐՁՐՈՒԹՅՈՒՆ", "ԳԻՆ"],
])
def test_headers_in_three_languages(headers):
    row = shop.parse_row(list(zip(headers, BASE.values())), "local", PERMISSION)
    assert row["source_id"] == "001"
    assert row["name"] == "Armchair"
    assert row["product_type"] == "chair"
    assert row["size_m"] == pytest.approx([1.2, .8, .85])
    assert row["price"] == 85000


@pytest.mark.parametrize("value, expected", [
    ("120 см", "120"), ("1 250,5", "1250.5"), ("85 000 ֏", "85000"),
    ("85\u00a0000 AMD", "85000"), ("85\u202f000 драм", "85000"),
    ("AMD 250", "250"), (120.5, "120.5"), (" 0 ", "0"),
])
def test_numbers(value, expected):
    assert shop.parse_number(value) == Decimal(expected)


@pytest.mark.parametrize("value", [None, "", "NaN", "inf", float("nan"),
                                       "120 x 80", "12,3,4", "85 USD", True])
def test_bad_numbers(value):
    with pytest.raises(ValueError):
        shop.parse_number(value)


def test_split_urls():
    assert shop.split_urls("https://x/a,https://x/b https://x/c\nhttps://x/a") == [
        "https://x/a", "https://x/b", "https://x/c"]
    assert shop.split_urls(None) == []


def test_complete_mapping_and_multiple_photo_columns():
    pairs = list(BASE.items()) + [
        ("Цвет", "синий"), ("Նյութ", "փայտ"),
        ("Photo URL 1", "https://x/a,https://x/b"), ("Photo URL 2", "https://x/c"),
        ("Photo URL 2", "https://x/d"), ("Product URL", "https://shop/item/001")]
    row = shop.parse_row(pairs, "local", PERMISSION)
    assert row["id"] == "local:001"
    assert row["source"] == "local"
    assert row["license"] == PERMISSION
    assert row["price_source"] == "shop"
    assert row["currency"] == "AMD"
    assert row["size_status"] == "estimated"
    assert row["size_evidence"] == {"from": "shop sheet"}
    assert row["fit_size_m"] == row["listing_size_m"] == row["size_m"]
    assert row["glb_url"] is None
    assert row["editor_set"] is False
    assert row["color_text"] == ["синий"]
    assert row["materials"] == ["փայտ"]
    assert row["image_urls"] == [f"https://x/{c}" for c in "abcd"]
    assert row["main_image_url"] == "https://x/a"
    assert row["description"] == "https://shop/item/001"


@pytest.mark.parametrize("field,value,reason", [
    ("width", None, "width: missing"), ("depth", "?", "depth: unparseable"),
    ("height", "4", "height: outside"), ("width", "401", "width: outside"),
    ("width", "0", "width: outside"), ("height", "-10", "height: outside"),
    ("price", "", "price: missing"), ("price", "call us", "price: unparseable"),
    ("price", "Infinity", "price: unparseable"),
    ("price", "2147483648", "price: outside"), ("price", "-1", "price: outside"),
    ("sku", "", "sku: missing"),
])
def test_rejections(field, value, reason):
    with pytest.raises(shop.RowRejected) as exc:
        shop.parse_row(list((BASE | {field: value}).items()), "local", PERMISSION)
    assert any(r.startswith(reason) for r in exc.value.reasons)


def test_size_boundaries_and_price_rounding():
    row = shop.parse_row(list((BASE | {"width": "5", "depth": "400", "price": "1 250,5"}).items()), "local", PERMISSION)
    assert row["size_m"] == [.05, 4, .85]
    assert row["price"] == 1251


@pytest.mark.parametrize("category,name,kind", [
    ("chair", "Model A", "chair"), ("BED_FRAME", "Model A", "bed"),
    ("SOFA", "Sofa Table", "table"), ("TABLE", "Table Lamp", "lamp"),
    ("unknown", "Model A", "other"),
])
def test_kind_mapping(category, name, kind):
    row = shop.parse_row(list((BASE | dict(category=category, name=name)).items()), "local", PERMISSION)
    assert row["kind"] == kind


@pytest.mark.parametrize("suffix", [".csv", ".xlsx"])
def test_files_dry_run_continues_counts_reasons_and_never_connects(tmp_path, monkeypatch, capsys, suffix):
    path = tmp_path / ("sheet" + suffix)
    rows = [list(BASE), list(BASE.values()),
            list((BASE | {"sku": "bad", "width": "", "price": "?"}).values()),
            list((BASE | {"sku": "bad2", "width": ""}).values()),
            list((BASE | {"sku": "002"}).values())]
    if suffix == ".csv":
        with path.open("w", encoding="utf-8-sig", newline="") as stream:
            csv.writer(stream, delimiter=";").writerows(rows)
    else:
        from openpyxl import Workbook
        book = Workbook()
        for row in rows:
            book.active.append(row)
        book.save(path)
        book.close()
    monkeypatch.delenv("VARPET_DB_URL", raising=False)
    monkeypatch.setattr(shop.psycopg, "connect", lambda *a, **kw: pytest.fail("DB connection"))
    shop.main(["--shop", "local", "--permission", PERMISSION, "--file", str(path), "--dry-run"])
    output = capsys.readouterr().out
    assert "loaded: 2" in output
    assert "rejected: 2" in output
    assert "width: missing: 2" in output
    assert "price: unparseable: 1" in output
    assert "chair: 2" in output
    assert "row 3" in output and "row 4" in output


@pytest.mark.parametrize("args", [[], ["--shop", "local", "--file", "a.csv"],
    ["--shop", "local", "--file", "a.csv", "--permission", "   "],
    ["--shop", "bad:slug", "--file", "a.csv", "--permission", PERMISSION]])
def test_required_arguments(args):
    with pytest.raises(SystemExit) as exc:
        shop.main(args)
    assert exc.value.code == 2
