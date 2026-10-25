const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('Claims accept a corrected name and Argentine phone format; two Google accounts require review',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema tnt_actions;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table tnt_people(id uuid primary key,full_name text,normalized_name text,first_name text,last_name text,birthday date,phone text,sex text,instagram text,active boolean default true,profile_consent boolean default false,data_notes jsonb,updated_at timestamptz default now());
 create table tnt_accounts(person_id uuid primary key references tnt_people,auth_user_id uuid unique,enabled boolean default true,system_role text default 'user',staff_status text default 'community');
 create table tnt_profile_private_fields(person_id uuid primary key,dni text);
 create table tnt_profile_link_requests(id uuid primary key default gen_random_uuid(),person_id uuid,target_person_id uuid,status text default 'pending',reviewed_at timestamptz,reviewed_by uuid);
 create unique index profile_link_pending on tnt_profile_link_requests(person_id,target_person_id) where status='pending';
 create table tnt_actions.profile_claim_attempts(auth_user_id uuid primary key,window_start timestamptz default now(),attempts int default 0);
 create table verified_calls(source uuid,target uuid);
 create function tnt_current_person_id() returns uuid language sql stable as $$select person_id from public.tnt_accounts where auth_user_id=auth.uid() and enabled$$;
 create function tnt_profile_values(pid uuid) returns jsonb language sql stable as $$select to_jsonb(p) from public.tnt_people p where id=pid$$;
 create function tnt_actions.profile_name(n text) returns text language sql immutable as $$select trim(regexp_replace(lower(translate(coalesce(n,''),'áéíóúüñÁÉÍÓÚÜÑ','aeiouunAEIOUUN')),'[^a-z0-9]+',' ','g'))$$;
 create function tnt_actions.link_verified_profile(src uuid,dst uuid) returns void language sql as $$insert into public.verified_calls values(src,dst)$$;
 `);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261024232426_profile_claim_retry.sql'),'utf8'));
 for(const [input,expected] of [['+54 9 11 1234-5678','1112345678'],['0054 9 11 12345678','1112345678'],['01112345678','1112345678'],['+598 99123456','59899123456']])assert.equal((await db.query('select tnt_actions.profile_phone($1) as value',[input])).rows[0].value,expected);
 await db.query('insert into tnt_people(id,full_name,first_name,last_name,birthday,phone) values($1,$2,$3,$4,$5,$6),($7,$8,$9,$10,$11,$12)',[id(1),'Alias Google','Alias','Google',null,null,id(2),'María Pérez','María','Pérez','2000-03-04','+54 9 11 12345678']);
 await db.query('insert into tnt_accounts(person_id,auth_user_id) values($1,$2),($3,null)',[id(1),id(11),id(2)]);await db.exec(`set request.jwt.claim.sub='${id(11)}'`);
 const call=async data=>(await db.query('select tnt_actions.continue_profile($1,$2::jsonb,true) as value',[id(2),JSON.stringify(data)])).rows[0].value;
 let value=await call({first_name:'María',last_name:'Pérez',birthday:'2000-03-04',phone:'1199999999'});assert.equal(value.linked,false);assert.equal((await db.query('select count(*) as n from verified_calls')).rows[0].n,0);
 value=await call({first_name:'María',last_name:'Pérez',birthday:'2000-03-04',phone:'1112345678'});assert.equal(value.linked,true);assert.equal((await db.query('select count(*) as n from verified_calls')).rows[0].n,1);
 await db.query('update tnt_accounts set auth_user_id=$1 where person_id=$2',[id(22),id(2)]);value=await call({first_name:'María',last_name:'Pérez',birthday:'2000-03-04',phone:'1112345678'});assert.equal(value.linked,false);assert.equal(value.pending_review,true);assert.equal((await db.query('select count(*) as n from verified_calls')).rows[0].n,1);assert.equal((await db.query('select count(*) as n from tnt_profile_link_requests')).rows[0].n,1);
 await db.query("update tnt_accounts set system_role='admin' where person_id=$1",[id(1)]);value=await call({first_name:'María',last_name:'Pérez',birthday:'2000-03-04',phone:'1112345678'});assert.equal(value.pending_review,true);const request=(await db.query('select person_id,target_person_id from tnt_profile_link_requests where id=$1',[value.request_id])).rows[0];assert.equal(request.person_id,id(2));assert.equal(request.target_person_id,id(1));
 }finally{await db.close();}
});
