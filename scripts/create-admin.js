import {createInterface} from 'node:readline/promises';
try{process.loadEnvFile('.env');}catch(e){if(e.code!=='ENOENT')throw e;}
const {store,passwordHash,audit}=await import('../server/db.js');
const email=process.argv.find(a=>a.startsWith('--email='))?.slice(8)?.toLowerCase();
if(!email||!/^\S+@\S+\.\S+$/.test(email)){console.error('Usage: npm run admin:create -- --email=you@example.com');await store.close();process.exit(1);}
const existing=await store.one('users',{email});
if(existing){await store.update('users',{id:existing.id},{role:'admin',plan:'business'});await audit(null,'admin.promoted',{user_id:existing.id});console.log('Existing account promoted to administrator.');}
else{
 if(!process.env.ADMIN_PASSWORD||process.env.ADMIN_PASSWORD.length<12){console.error('For a new administrator, set ADMIN_PASSWORD securely to at least 12 characters; or register in the website first and rerun this command.');await store.close();process.exit(1);}
 const user=await store.insert('users',{email,name:'Administrator',password:passwordHash(process.env.ADMIN_PASSWORD),role:'admin',plan:'business'});await audit(null,'admin.created',{user_id:user.id});console.log('Administrator created. Sign in with the email and password you supplied.');
}
await store.close();
