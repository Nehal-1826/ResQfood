@echo off
echo =======================================================
echo ResQfood - Connecting Surplus Food to Those in Need
echo =======================================================
echo.
echo Installing dependencies (if needed)...
call npm install
echo.
echo Starting the ResQfood Server...
echo Make sure MySQL is running on your machine with password Kbsa5894@
echo The database (foodbridge_db) and tables will be created automatically.
echo.
call npm start
pause
