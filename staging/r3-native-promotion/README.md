# R3 Native Promotion MySQL8 isolated UAT

This test uses the exact source of Publisher 0.6.9 PrivateDraftCampaign.php and Sites 0.15.10 private Email migration (SHA256 verified by test). It creates/drops tables ONLY in disposable MySQL8 service database r3_test in a GitHub Actions runner.

**Not a production installer.** The binary fixtures are stored in staging/r3-native-promotion/fixtures.zip with SHA256 f9c87e4dfdf4751fa19d1fabbb1b09b0e7e579cf685a4dbe0f60a1bac49b120b. The launcher refuses a non-GitHub Actions or non-127.0.0.1 test database. It does not connect to the HakiSend VPS or send SMTP.

The native Acelle model classes and IdentityCatalog are test doubles. Passing demonstrates real SQL behavior of the actual service in isolation, NOT Laravel routing or actual Acelle model compatibility.
