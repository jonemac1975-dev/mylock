let key;

export async function initKey(pass){
 const enc=new TextEncoder();

 const base=await crypto.subtle.importKey(
  "raw",enc.encode(pass),
  {name:"PBKDF2"},false,["deriveKey"]
 );

 key=await crypto.subtle.deriveKey({
  name:"PBKDF2",
  salt:enc.encode("vault"),
  iterations:100000,
  hash:"SHA-256"
 },base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}

export async function encrypt(text){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const enc=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(text));
 return JSON.stringify({iv:Array.from(iv),data:Array.from(new Uint8Array(enc))});
}

export async function decrypt(json){
 const obj=JSON.parse(json);
 const dec=await crypto.subtle.decrypt({name:"AES-GCM",iv:new Uint8Array(obj.iv)},key,new Uint8Array(obj.data));
 return new TextDecoder().decode(dec);
}