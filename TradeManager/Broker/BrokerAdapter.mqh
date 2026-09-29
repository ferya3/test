#ifndef TM_BROKERADAPTER_MQH
#define TM_BROKERADAPTER_MQH

#include <Trade/Trade.mqh>
#include "SymbolRules.mqh"
#include "VolumeRules.mqh"

// Raw view of one open MT5 position.
struct SPositionSnapshot
{
   ulong               ticket;
   string              symbol;
   ENUM_POSITION_TYPE  type;
   double              volume;
   double              entry;
   double              sl;
   double              tp;
   double              price;
   double              profit;
   long                magic;
   string              comment;
   datetime            openTime;
};

// The only place that talks to MT5 directly: symbol data, ticks, account, positions, CTrade.
class CBrokerAdapter
{
private:
   CTrade m_trade;
   uint   m_retcode;
   int    m_error;

   void ReadSelected(SPositionSnapshot &s)
   {
      s.ticket   = (ulong)PositionGetInteger(POSITION_TICKET);
      s.symbol   = PositionGetString(POSITION_SYMBOL);
      s.type     = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      s.volume   = PositionGetDouble(POSITION_VOLUME);
      s.entry    = PositionGetDouble(POSITION_PRICE_OPEN);
      s.sl       = PositionGetDouble(POSITION_SL);
      s.tp       = PositionGetDouble(POSITION_TP);
      s.price    = PositionGetDouble(POSITION_PRICE_CURRENT);
      s.profit   = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
      s.magic    = PositionGetInteger(POSITION_MAGIC);
      s.comment  = PositionGetString(POSITION_COMMENT);
      s.openTime = (datetime)PositionGetInteger(POSITION_TIME);
   }

public:
   CBrokerAdapter() { m_retcode = 0; m_error = 0; }

   void Init(const ulong deviationPoints)
   {
      m_trade.SetDeviationInPoints(deviationPoints);
      m_trade.SetAsyncMode(false);
      m_trade.LogLevel(LOG_LEVEL_ERRORS);
   }

   // ---- symbol / tick ------------------------------------------------------
   bool LoadRules(const string sym, SSymbolRules &rules, SVolumeRules &vol)
   {
      return(rules.Load(sym) && vol.Load(sym));
   }

   bool Tick(const string sym, double &bid, double &ask)
   {
      MqlTick t;
      if(!SymbolInfoTick(sym, t))
         return false;
      bid = t.bid;
      ask = t.ask;
      return(bid > 0.0 && ask > 0.0);
   }

   // ---- account ------------------------------------------------------------
   double Balance() const      { return AccountInfoDouble(ACCOUNT_BALANCE); }
   double Equity() const       { return AccountInfoDouble(ACCOUNT_EQUITY); }
   double FreeMargin() const   { return AccountInfoDouble(ACCOUNT_MARGIN_FREE); }
   double MarginLevel() const  { return AccountInfoDouble(ACCOUNT_MARGIN_LEVEL); }
   double Floating() const     { return AccountInfoDouble(ACCOUNT_PROFIT); }
   long   Login() const        { return AccountInfoInteger(ACCOUNT_LOGIN); }

   bool IsTradeAllowed() const
   {
      return(TerminalInfoInteger(TERMINAL_CONNECTED) != 0 &&
             TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) != 0 &&
             MQLInfoInteger(MQL_TRADE_ALLOWED) != 0 &&
             AccountInfoInteger(ACCOUNT_TRADE_ALLOWED) != 0 &&
             AccountInfoInteger(ACCOUNT_TRADE_EXPERT) != 0);
   }

   // Net result (profit + commission + swap + fee) of deals between the two times.
   double RealizedResult(const datetime from, const datetime to)
   {
      if(!HistorySelect(from, to))
         return 0.0;
      double sum = 0.0;
      const int total = HistoryDealsTotal();
      for(int i = 0; i < total; i++)
      {
         const ulong deal = HistoryDealGetTicket(i);
         if(deal == 0)
            continue;
         const long type = HistoryDealGetInteger(deal, DEAL_TYPE);
         if(type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL)
            continue;
         sum += HistoryDealGetDouble(deal, DEAL_PROFIT)
              + HistoryDealGetDouble(deal, DEAL_COMMISSION)
              + HistoryDealGetDouble(deal, DEAL_SWAP)
              + HistoryDealGetDouble(deal, DEAL_FEE);
      }
      return sum;
   }

   // ---- positions ----------------------------------------------------------
   int PositionCount() const { return PositionsTotal(); }

   bool PositionAt(const int index, SPositionSnapshot &s)
   {
      const ulong ticket = PositionGetTicket(index);
      if(ticket == 0)
         return false;
      ReadSelected(s);
      return true;
   }

   bool PositionByTicket(const ulong ticket, SPositionSnapshot &s)
   {
      if(!PositionSelectByTicket(ticket))
         return false;
      ReadSelected(s);
      return true;
   }

   // ---- trade execution ----------------------------------------------------
   bool ModifyPosition(const ulong ticket, const double sl, const double tp)
   {
      ResetLastError();
      m_trade.PositionModify(ticket, sl, tp);
      return Finish();
   }

   // volume <= 0 closes the whole position.
   bool ClosePosition(const ulong ticket, const double volume)
   {
      ResetLastError();
      if(volume > 0.0)
         m_trade.PositionClosePartial(ticket, volume);
      else
         m_trade.PositionClose(ticket);
      return Finish();
   }

   uint   LastRetcode() const { return m_retcode; }
   int    LastError() const   { return m_error; }

private:
   // CTrade's boolean is not reliable on its own: the retcode decides.
   bool Finish()
   {
      m_error   = GetLastError();
      m_retcode = m_trade.ResultRetcode();
      return(m_retcode == TRADE_RETCODE_DONE ||
             m_retcode == TRADE_RETCODE_DONE_PARTIAL ||
             m_retcode == TRADE_RETCODE_PLACED ||
             m_retcode == TRADE_RETCODE_NO_CHANGES);
   }
};

#endif
