---
id: "20260926T215217Z-catalog-searching-a-product-by-its-exact-name-doesn-t-su-b184a3f4d26646fa80c9573c563123dd"
lane: "catalog"
severity: "minor"
status: "open"
title: "Searching a product by its exact name doesn't surface it (ranks 14th, or not in the top 20)"
reported_by: "bughunt-e2e"
created: "2026-09-26T21:52:17.588304Z"
---

**Steps**

curl 'http://localhost:5173/api/catalog/search?text=Kandinsky%20Painting%20with%20Green%20Center&kind=' ; same with text=Green%20Center. Or type these in the editor furniture search.

**Expected**

The item whose name contains the query ('Framed print, Kandinsky Painting with Green Center, thin black metal frame 50 x 50', extra:art-prints:print-kandinsky-green-center-black-metal-50x50) is result #1.

**Actual**

Full-name query: item is at index 13 of 20 (first 6 cards shown in the editor are other Kandinsky/Delaunay prints). 'Green Center': not in the 20 results at all (mirrors, philodendron, green cushions). No exact/substring name match boost in ranking. Screenshot: /tmp/bughunt-e2e/36-greencenter-search.png.

**Evidence**



**Notes**
