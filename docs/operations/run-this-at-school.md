# Run this at school (2 minutes)

## MacBook

1. Connect to the school WiFi.
2. Open **Terminal** (press Cmd+Space, type "Terminal", press Enter).
3. Paste this one line and press Enter (adjust the path if the folder lives elsewhere):

   sh /path/to/mathnexa-schoolnet/scripts/diagnose-school-network.sh

4. Wait until it prints "Saved:".
5. Find **school-network-diagnostic.txt** on the Desktop.
6. Send that file back for analysis.

## Windows laptop

1. Connect to the school WiFi.
2. Press Start, type "PowerShell", open **Windows PowerShell**.
3. Paste this one line and press Enter:

   powershell -ExecutionPolicy Bypass -File "C:\GitHub\mathnexa-schoolnet\scripts\diagnose-school-network.ps1"

4. Wait until it prints "Saved:".
5. Find **school-network-diagnostic.txt** on the Desktop.
6. Send that file back for analysis.

That's all — the report contains only network test results, nothing personal.
