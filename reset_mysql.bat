@echo on
set LOG=C:\Users\kanna\OneDrive\Desktop\intern\FoodBridge\reset_log.txt
set MYSQL=C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe
echo === %date% %time% : reset v3 (shared memory) === > %LOG%
taskkill /F /IM mysqld.exe >> %LOG% 2>&1
timeout /t 3 /nobreak >nul
sc config MySQL80 binPath= "\"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe\" --defaults-file=\"C:\ProgramData\MySQL\MySQL Server 8.0\my.ini\" --skip-grant-tables --shared-memory" >> %LOG% 2>&1
net start MySQL80 >> %LOG% 2>&1
timeout /t 10 /nobreak >nul
echo --- alter via shared memory --- >> %LOG%
"%MYSQL%" -uroot --protocol=MEMORY -e "FLUSH PRIVILEGES; ALTER USER 'root'@'localhost' IDENTIFIED BY 'FoodBridge2026!';" >> %LOG% 2>&1
echo --- restore and restart --- >> %LOG%
sc config MySQL80 binPath= "\"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe\" --defaults-file=\"C:\ProgramData\MySQL\MySQL Server 8.0\my.ini\"" >> %LOG% 2>&1
net stop MySQL80 >> %LOG% 2>&1
taskkill /F /IM mysqld.exe >> %LOG% 2>&1
timeout /t 3 /nobreak >nul
net start MySQL80 >> %LOG% 2>&1
timeout /t 10 /nobreak >nul
echo --- verify over TCP --- >> %LOG%
"%MYSQL%" -uroot -pFoodBridge2026! --protocol=TCP -e "SELECT 'TCP RESET OK' AS result;" >> %LOG% 2>&1
echo === done %date% %time% === >> %LOG%
