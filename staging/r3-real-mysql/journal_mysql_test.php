<?php
declare(strict_types=1);
require __DIR__.'/vendor/autoload.php';
use Illuminate\Container\Container;
use Illuminate\Database\Capsule\Manager as Capsule;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Facade;
use Illuminate\Support\Facades\Schema;
$app=new Container;Container::setInstance($app);Facade::setFacadeApplication($app);
$capsule=new Capsule($app);
$capsule->addConnection([
 'driver'=>'mysql','host'=>getenv('R3_DB_HOST')?:'127.0.0.1',
 'port'=>(int)(getenv('R3_DB_PORT')?:3306),'database'=>getenv('R3_DB_NAME')?:'r3_test',
 'username'=>getenv('R3_DB_USER')?:'root','password'=>getenv('R3_DB_PASSWORD')?:'testpass',
 'charset'=>'utf8mb4','collation'=>'utf8mb4_unicode_ci','prefix'=>'','strict'=>true
]);
$capsule->setAsGlobal();$capsule->bootEloquent();$db=$capsule->getConnection();
$app->instance('db',$capsule->getDatabaseManager());
$app->instance('db.schema',$db->getSchemaBuilder());
$n=0;
function ok(bool $truth,string $label):void{
 global $n;$n++;if(!$truth)throw new RuntimeException('FAILED_'.$label);
 echo 'PASS='.$label.PHP_EOL;
}
function row(int $owner,int $site,int $campaign,string $request,string $action='send_now',?string $time=null):array{
 return [
  'customer_id'=>$owner,'site_id'=>$site,'campaign_id'=>$campaign,'approved_by'=>8,
  'request_uid'=>$request,'action'=>$action,'status'=>'claimed','recipient_count'=>2,
  'approval_fingerprint'=>str_repeat('a',64),'consent_basis'=>'single_optin',
  'consent_source'=>'Synthetic signup evidence in CI','run_at'=>$time,'submitted_at'=>null,
  'created_at'=>'2026-10-25 07:00:00','updated_at'=>'2026-10-25 07:00:00',
 ];
}
function duplicate(callable $action):void{
 $yes=false;try{$action();}catch(QueryException $e){
   $yes=(int)($e->errorInfo[1]??0)===1062;
   if(!$yes)throw $e;
 }
 ok($yes,'mysql_unique_rejects_duplicate');
}
$t='hakisend_publisher_delivery_approvals';
Schema::dropIfExists($t);
try{
 $migration=require __DIR__.'/migration.php';$migration->up();
 ok(Schema::hasTable($t),'laravel_mysql_migration_created');
 $migration->up();ok(Schema::hasTable($t),'migration_idempotent');
 $indexes=array_unique(array_map(fn($i)=>$i->Key_name,$db->select('SHOW INDEX FROM '.$t)));
 ok(in_array('hp_del_once_per_campaign',$indexes,true),'unique_campaign_index');
 ok(in_array('hp_del_once_per_request',$indexes,true),'unique_request_index');
 $a='123e4567-e89b-42d3-a456-426614174000';
 $b='123e4567-e89b-42d3-a456-426614174001';
 $c='123e4567-e89b-42d3-a456-426614174002';
 $d='123e4567-e89b-42d3-a456-426614174003';
 $db->table($t)->insert(row(1,11,101,$a));
 ok($db->table($t)->count()===1,'first_delivery_claim');
 duplicate(fn()=> $db->table($t)->insert(row(1,11,101,$b)));
 duplicate(fn()=> $db->table($t)->insert(row(1,11,102,$a)));
 ok($db->table($t)->count()===1,'no_duplicate_side_effect');
 $db->table($t)->insert(row(2,21,101,$a));
 ok($db->table($t)->count()===2,'independent_tenants');
 ok(!$db->table($t)->where('customer_id',1)->where('site_id',21)
     ->where('campaign_id',101)->where('request_uid',$a)->exists(),'foreign_site_receipt_block');
 ok(!$db->table($t)->where('customer_id',3)->where('site_id',11)
     ->where('campaign_id',101)->where('request_uid',$a)->exists(),'foreign_customer_receipt_block');
 $db->table($t)->insert(row(1,11,103,$b,'schedule','2026-11-02 07:20:00'));
 ok((string)$db->table($t)->where('campaign_id',103)->value('action')==='schedule','native_schedule_metadata');
 $updated=$db->table($t)->where('customer_id',1)->where('campaign_id',103)
    ->where('status','claimed')->update(['status'=>'scheduled']);
 ok($updated===1,'first_journal_finalization');
 ok($db->table($t)->where('customer_id',1)->where('campaign_id',103)
    ->where('status','claimed')->update(['status'=>'handed_off'])===0,'finalization_guard_prevents_double');
 $before=$db->table($t)->count();
 try{$db->transaction(function()use($db,$t,$c){
   $db->table($t)->insert(row(1,11,104,$c));throw new RuntimeException('ROLLBACK_TEST');
 });}catch(RuntimeException $e){ok($e->getMessage()==='ROLLBACK_TEST','intentional_transaction_abort');}
 ok($db->table($t)->count()===$before,'transaction_rollback_leaves_no_claim');
 $db->transaction(function()use($db,$t,$d){
   ok(!$db->table($t)->where('customer_id',1)->where('campaign_id',105)->lockForUpdate()->exists(),
      'fresh_campaign_lock');
   $db->table($t)->insert(row(1,11,105,$d));
 });
 ok($db->table($t)->where('customer_id',1)->where('campaign_id',105)->count()===1,
    'transaction_claim_once');
 $got=$db->table($t)->where('customer_id',1)->where('site_id',11)
   ->where('campaign_id',105)->where('request_uid',$d)->first();
 ok($got!==null&&$got->status==='claimed','read_only_receipt_lookup');
 ok($db->table($t)->count()===$before+1,'receipt_lookup_does_not_write');
 echo "RESULT=R3_REAL_MYSQL8_DELIVERY_JOURNAL_PASS CHECKS=$n SMTP=NONE WORKER=NOT_TESTED".PHP_EOL;
} finally {Schema::dropIfExists($t);}
