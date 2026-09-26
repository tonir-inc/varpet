"""Bounded, conversation-private inspiration files; never interpolate image data into prompts."""
import base64
import binascii
from pathlib import Path
import re
import uuid

MAX_BYTES=256*1024


def validate_image(value):
    if not isinstance(value,dict) or set(value)!={'name','dataUrl'}:
        raise ValueError('image must contain name and dataUrl')
    name=value['name']
    if not isinstance(name,str) or not name.strip() or len(name)>120 or any(c in name for c in '/\\\0\r\n'):
        raise ValueError('image.name must be a plain filename of at most 120 characters')
    data=value['dataUrl']
    if not isinstance(data,str) or len(data)>((MAX_BYTES+2)//3)*4+40:
        raise ValueError('image must be PNG/JPEG/WebP of at most 256 KiB; resize before sending')
    match=re.fullmatch(r'data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]*={0,2})',data)
    if not match:raise ValueError('image.dataUrl must contain PNG/JPEG/WebP bytes, not a URL or file path')
    try:raw=base64.b64decode(match[2],validate=True)
    except (ValueError,binascii.Error) as error:raise ValueError('Invalid image base64') from error
    if len(raw)>MAX_BYTES or not matches(raw,match[1]):
        raise ValueError('image bytes do not match its MIME type or exceed 256 KiB')
    return raw,match[1]


def matches(raw,kind):
    return (kind=='png' and raw.startswith(b'\x89PNG\r\n\x1a\n') or
            kind=='jpeg' and raw.startswith(b'\xff\xd8\xff') or
            kind=='webp' and raw.startswith(b'RIFF') and raw[8:12]==b'WEBP')


def store_image(value,root):
    raw,extension=validate_image(value)
    directory=Path(root)/'inspiration';directory.mkdir(mode=0o700,exist_ok=True)
    path=directory/(uuid.uuid4().hex+'.'+extension)
    with path.open('xb') as file:
        path.chmod(0o600);file.write(raw)
    return str(path.resolve())


def local_attachment(path):
    path=Path(path).resolve()
    if not path.is_file() or path.stat().st_size>MAX_BYTES:
        raise ValueError('Inspiration attachment must be a file of at most 256 KiB')
    with path.open('rb') as file:header=file.read(12)
    if not any(matches(header,kind) for kind in ('png','jpeg','webp')):
        raise ValueError('Invalid inspiration image attachment')
    return str(path)
