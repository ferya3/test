//+------------------------------------------------------------------+
//| TradeManager.mq5                                                 |
//| Position manager: break-even, trailing, partial closes, risk     |
//| guard and crash recovery. It never opens trades.                 |
//+------------------------------------------------------------------+
#property copyright "TradeManager"
#property version   "1.40"
#property description "Manages existing positions only: SL, break-even, trailing, partial close."

#include "Core/Engine.mqh"

CEngine Engine;

int OnInit()
{
   return Engine.Initialize();
}

void OnTick()
{
   Engine.OnTick();
}

void OnTimer()
{
   Engine.OnTimer();
}

void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
{
   Engine.OnTradeTransaction(trans, request, result);
}

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
{
   Engine.OnChartEvent(id, lparam, dparam, sparam);
}

void OnDeinit(const int reason)
{
   Engine.Shutdown(reason);
}
