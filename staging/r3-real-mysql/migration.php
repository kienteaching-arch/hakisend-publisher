<?php
// SHA-matched fixture from Publisher R3 v0.6.8 staging ZIP.
// This database migration creates ONLY the delivery approval ledger.
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void {
        if (Schema::hasTable('hakisend_publisher_delivery_approvals')) return;
        Schema::create('hakisend_publisher_delivery_approvals', function (Blueprint $t): void {
            $t->bigIncrements('id');
            $t->unsignedBigInteger('customer_id');
            $t->unsignedBigInteger('site_id');
            $t->unsignedBigInteger('campaign_id');
            $t->unsignedBigInteger('approved_by');
            $t->uuid('request_uid');
            $t->string('action', 24);
            $t->string('status', 32);
            $t->unsignedBigInteger('recipient_count');
            $t->char('approval_fingerprint', 64);
            $t->string('consent_basis', 40);
            $t->string('consent_source', 255);
            $t->timestamp('run_at')->nullable();
            $t->timestamp('submitted_at')->nullable();
            $t->timestamps();
            $t->unique(['customer_id','campaign_id'], 'hp_del_once_per_campaign');
            $t->unique(['customer_id','request_uid'], 'hp_del_once_per_request');
            $t->index(['customer_id','site_id','status'],'hp_del_customer_site_status');
        });
    }
    public function down(): void {}
};
