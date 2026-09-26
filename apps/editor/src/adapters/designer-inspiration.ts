/** HTTP upload only. The service materializes private files for model attachments. */
export interface DesignerImage {name:string;dataUrl:string}
export const MAX_DESIGNER_IMAGE_BYTES=256*1024;
export function validateDesignerImage(value:DesignerImage):DesignerImage {
 if(!value||typeof value!=='object'||Object.keys(value).some(k=>k!=='name'&&k!=='dataUrl')||typeof value.name!=='string'||!value.name.trim()||value.name.length>120||/[\/\\\0\r\n]/.test(value.name))throw new Error('image.name must be a plain filename of at most 120 characters.');
 if(typeof value.dataUrl!=='string'||value.dataUrl.length>Math.ceil(MAX_DESIGNER_IMAGE_BYTES/3)*4+40)throw new Error('Inspiration image exceeds 256 KiB; resize before sending.');
 const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value.dataUrl);
 if(!match)throw new Error('Inspiration image must contain PNG/JPEG/WebP bytes, not a URL or path.');
 let raw:string;try{raw=atob(match[2]!);}catch{throw new Error('Invalid inspiration image base64.');}
 const magic=match[1]==='png'?raw.startsWith('\x89PNG\r\n\x1a\n'):match[1]==='jpeg'?raw.startsWith('\xff\xd8\xff'):raw.startsWith('RIFF')&&raw.slice(8,12)==='WEBP';
 if(!magic||raw.length>MAX_DESIGNER_IMAGE_BYTES)throw new Error('Inspiration image MIME mismatch or size over 256 KiB.');
 return {...value};
}
