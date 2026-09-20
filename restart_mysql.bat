@echo on
set LOG=C:\Users\kanna\OneDrive\Desktop\intern\FoodBridge\reset_log.txt
echo === %date% %time% : clean restart === > %LOG%
taskkill /F /IM mysqld.exe >> %LOG% 2>&1
timeout /t 3 /nobreak >nul
sc config MySQL80 binPath= "\"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe\" --defaults-file=\"C:\ProgramData\MySQL\MySQL Server 8.0\my.ini\"" >> %LOG% 2>&1
net start MySQL80 >> %LOG% 2>&1
timeout /t 8 /nobreak >nul
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -uroot -pFoodBridge2026! --protocol=TCP -e "SELECT 'TCP OK' AS result;" >> %LOG% 2>&1
echo === done %date% %time% === >> %LOG%
