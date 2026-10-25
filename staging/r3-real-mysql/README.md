# R3 isolated real MySQL8 Delivery Journal test

This is an actual MySQL 8.0 service and Illuminate 12 DB/Schema integration test.

- It creates and removes only the synthetic Delivery Journal table inside disposable GitHub Actions r3_test database.
- It executes the R3 0.6.8 journal migration (same schema and indexes).
- Verifies both native MySQL unique indexes, duplicate request/campaign veto (SQL error 1062), different Customer isolation, receipt scoped by Customer/Site/Campaign/Request, scheduled metadata, claimed-only status finalization, DB rollback and transaction row lock.
- No API token, production database, customer email, SMTP, worker, or native Campaign launch.
- Does not establish complete Acelle Laravel installation or real OAuth/queue integration. Those remain a separate gate.

GitHub Actions workflow: .github/workflows/r3-real-mysql.yml. This fixture is not an installable HakiSend plugin.
