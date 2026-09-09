import fs from 'node:fs';
import PocketBase from 'pocketbase';
const pb=new PocketBase('http://127.0.0.1:8091');
await pb.collection('_superusers').authWithPassword(process.env.PB_SUPERUSER_EMAIL,process.env.PB_SUPERUSER_PASSWORD);
const t=await pb.collection('fiskaly_transactions').getFirstListItem('status="signed" && receiptType="NORMAL"');
if (!t.receiptSnapshot.lines.every(l=>l.text.startsWith('Synthetic test'))) throw new Error('Expected synthetic fixture');
fs.writeFileSync('apps/web/rksv-preview.json',JSON.stringify(t));
