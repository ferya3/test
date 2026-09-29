//+------------------------------------------------------------------+
//| TM_SmokeTest.mq5 - tiny EA to check the install, not the manager |
//+------------------------------------------------------------------+
#property copyright "TradeManager"
#property version   "1.00"

#include <Trade/Trade.mqh>

input group "Test"
input int InpDummy = 1;   // Dummy input

CTrade g_trade;

int OnInit()
{
   Print("TM_SmokeTest loaded, build ", TerminalInfoInteger(TERMINAL_BUILD));
   return INIT_SUCCEEDED;
}

void OnTick() {}
