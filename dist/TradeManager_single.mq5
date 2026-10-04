//+------------------------------------------------------------------+
//| TradeManager.mq5                                                 |
//| Position manager: break-even, trailing, partial closes, risk     |
//| guard and crash recovery. Automation never opens trades; the     |
//| panel has manual BUY / SELL / pending order buttons.             |
//+------------------------------------------------------------------+
#property copyright "TradeManager"
#property version   "2.20"
#property description "Manages open positions (SL, break-even, trailing, partial close). New orders only from the panel buttons."

#ifndef TM_ENGINE_MQH
#define TM_ENGINE_MQH

#ifndef TM_CONFIG_MQH
#define TM_CONFIG_MQH

#ifndef TM_LOGGER_MQH
#define TM_LOGGER_MQH

enum ENUM_TM_LOG_LEVEL
{
   TMLOG_ERROR = 0,
   TMLOG_WARN  = 1,
   TMLOG_INFO  = 2,
   TMLOG_DEBUG = 3
};

class CLogger
{
private:
   ENUM_TM_LOG_LEVEL m_level;

   void Write(const ENUM_TM_LOG_LEVEL level, const string label, const string tag, const string msg)
   {
      if(level > m_level)
         return;
      PrintFormat("[TM][%s][%s] %s", label, tag, msg);
   }

public:
   CLogger() { m_level = TMLOG_INFO; }

   void SetLevel(const ENUM_TM_LOG_LEVEL level) { m_level = level; }

   void Error(const string tag, const string msg) { Write(TMLOG_ERROR, "ERROR", tag, msg); }
   void Warn(const string tag, const string msg)  { Write(TMLOG_WARN,  "WARN",  tag, msg); }
   void Info(const string tag, const string msg)  { Write(TMLOG_INFO,  "INFO",  tag, msg); }
   void Debug(const string tag, const string msg) { Write(TMLOG_DEBUG, "DEBUG", tag, msg); }
};

CLogger Logger;

#endif

#ifndef TM_TRAILINGMANAGER_MQH
#define TM_TRAILINGMANAGER_MQH

#ifndef TM_POSITIONSTATE_MQH
#define TM_POSITIONSTATE_MQH

#ifndef TM_BROKERADAPTER_MQH
#define TM_BROKERADAPTER_MQH

#include <Trade/Trade.mqh>
#ifndef TM_SYMBOLRULES_MQH
#define TM_SYMBOLRULES_MQH

// Per-symbol price rules: digits, tick size, stop and freeze levels.
// For an open position MT5 checks SL/TP against the closing side:
// Bid for BUY, Ask for SELL.
struct SSymbolRules
{
   string symbol;
   int    digits;
   double point;
   double tickSize;
   double tickValue;
   double stopsPoints;
   double freezePoints;

   bool Load(const string sym)
   {
      symbol       = sym;
      digits       = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      point        = SymbolInfoDouble(sym, SYMBOL_POINT);
      tickSize     = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
      tickValue    = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE_LOSS);
      if(tickValue <= 0.0)
         tickValue = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
      stopsPoints  = (double)SymbolInfoInteger(sym, SYMBOL_TRADE_STOPS_LEVEL);
      freezePoints = (double)SymbolInfoInteger(sym, SYMBOL_TRADE_FREEZE_LEVEL);
      return(point > 0.0 && tickSize > 0.0 && tickValue > 0.0);
   }

   double NormalizePrice(const double price) const
   {
      return NormalizeDouble(MathRound(price / tickSize) * tickSize, digits);
   }

   double MinStopDistance() const { return stopsPoints * point; }
   double FreezeDistance() const  { return freezePoints * point; }

   double ClosePrice(const bool isBuy, const double bid, const double ask) const
   {
      return isBuy ? bid : ask;
   }

   bool IsValidSL(const bool isBuy, const double sl, const double bid, const double ask) const
   {
      if(sl <= 0.0)
         return false;
      const double ref = ClosePrice(isBuy, bid, ask);
      const double dist = isBuy ? (ref - sl) : (sl - ref);
      return(dist >= MinStopDistance() - point * 0.5);
   }

   bool IsValidTP(const bool isBuy, const double tp, const double bid, const double ask) const
   {
      if(tp <= 0.0)
         return false;
      const double ref = ClosePrice(isBuy, bid, ask);
      const double dist = isBuy ? (tp - ref) : (ref - tp);
      return(dist >= MinStopDistance() - point * 0.5);
   }

   // MT5 refuses to modify a position whose SL or TP is within the freeze level of the market.
   bool IsFrozen(const bool isBuy, const double curSL, const double curTP,
                 const double bid, const double ask) const
   {
      if(freezePoints <= 0.0)
         return false;
      const double ref = ClosePrice(isBuy, bid, ask);
      const double fz  = FreezeDistance();
      if(curSL > 0.0 && MathAbs(ref - curSL) <= fz)
         return true;
      if(curTP > 0.0 && MathAbs(curTP - ref) <= fz)
         return true;
      return false;
   }
};

#endif

#ifndef TM_VOLUMERULES_MQH
#define TM_VOLUMERULES_MQH

#ifndef TM_MATHUTILS_MQH
#define TM_MATHUTILS_MQH

#define TM_EPS 1e-9

bool TM_IsZero(const double v)
{
   return MathAbs(v) < TM_EPS;
}

// Number of decimals needed to represent a step such as 0.01 or 0.5.
int TM_StepDigits(const double step)
{
   int d = 0;
   double s = step;
   while(d < 8 && MathAbs(s - MathRound(s)) > 1e-7)
   {
      s *= 10.0;
      d++;
   }
   return d;
}

double TM_FloorToStep(const double value, const double step)
{
   if(step <= 0.0)
      return value;
   return NormalizeDouble(MathFloor(value / step + 1e-7) * step, TM_StepDigits(step));
}

#endif


struct SVolumeRules
{
   double minVol;
   double maxVol;
   double step;

   bool Load(const string sym)
   {
      minVol = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
      maxVol = SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX);
      step   = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);
      return(minVol > 0.0 && maxVol >= minVol && step > 0.0);
   }

   // Rounds down to the volume step and caps at the maximum.
   // Returns 0 when the result would be below the minimum volume.
   double Normalize(const double volume) const
   {
      double v = MathMin(volume, maxVol);
      v = TM_FloorToStep(v, step);
      if(v < minVol - TM_EPS)
         return 0.0;
      return v;
   }
};

#endif


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

   // Market (BUY / SELL) or pending (LIMIT / STOP) order. `price` is used by pending orders only.
   bool SendOrder(const ENUM_ORDER_TYPE type, const string sym, const double volume, const double price,
                  const double sl, const double tp, const long magic, const string comment)
   {
      ResetLastError();
      m_trade.SetExpertMagicNumber((ulong)magic);
      m_trade.SetTypeFillingBySymbol(sym);
      switch(type)
      {
         case ORDER_TYPE_BUY:        m_trade.Buy(volume, sym, 0.0, sl, tp, comment); break;
         case ORDER_TYPE_SELL:       m_trade.Sell(volume, sym, 0.0, sl, tp, comment); break;
         case ORDER_TYPE_BUY_LIMIT:  m_trade.BuyLimit(volume, price, sym, sl, tp, ORDER_TIME_GTC, 0, comment); break;
         case ORDER_TYPE_BUY_STOP:   m_trade.BuyStop(volume, price, sym, sl, tp, ORDER_TIME_GTC, 0, comment); break;
         case ORDER_TYPE_SELL_LIMIT: m_trade.SellLimit(volume, price, sym, sl, tp, ORDER_TIME_GTC, 0, comment); break;
         case ORDER_TYPE_SELL_STOP:  m_trade.SellStop(volume, price, sym, sl, tp, ORDER_TIME_GTC, 0, comment); break;
         default:
            m_retcode = 0;
            m_error = 0;
            return false;
      }
      return Finish();
   }

   // volume <= 0 closes the whole position.
   bool ClosePosition(const ulong ticket, const double volume)
   {
      ResetLastError();
      if(PositionSelectByTicket(ticket))
         m_trade.SetTypeFillingBySymbol(PositionGetString(POSITION_SYMBOL));
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



// Independent management flags: several can be active at once.
#define TM_FLAG_BE        0x01
#define TM_FLAG_TRAILING  0x02

#define TM_PARTIAL_LEVELS 3

// Informational summary derived from the flags; never used to gate logic.
enum ENUM_POS_STATE
{
   POS_OPEN = 0,      // no stop loss yet
   POS_PROTECTED,     // stop loss in place
   POS_BE_DONE,       // break-even executed
   POS_PARTIAL,       // at least one partial close executed
   POS_TRAILING,      // trailing started
   POS_CLOSED
};

string TM_StateText(const ENUM_POS_STATE s)
{
   switch(s)
   {
      case POS_OPEN:      return "OPEN";
      case POS_PROTECTED: return "PROTECTED";
      case POS_BE_DONE:   return "BE";
      case POS_PARTIAL:   return "PARTIAL";
      case POS_TRAILING:  return "TRAILING";
      case POS_CLOSED:    return "CLOSED";
   }
   return "?";
}

// True when `candidate` protects more than `current` for this direction.
bool TM_IsBetterSL(const bool isBuy, const double candidate, const double current)
{
   return isBuy ? (candidate > current) : (candidate < current);
}

// One managed position: the live MT5 fields plus everything the manager has to remember.
class CManagedPosition
{
public:
   // live
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

   // management
   double              initialSL;
   double              initialRisk;     // price distance |entry - initialSL|
   double              initialVolume;
   int                 flags;
   int                 partialMask;     // bit n set = partial level n done
   ENUM_POS_STATE      state;
   bool                dirty;           // needs persisting
   bool                seen;            // scratch flag used by the synchronizer

   CManagedPosition()
   {
      ticket = 0; symbol = ""; type = POSITION_TYPE_BUY;
      volume = 0.0; entry = 0.0; sl = 0.0; tp = 0.0; price = 0.0; profit = 0.0;
      magic = 0; comment = ""; openTime = 0;
      initialSL = 0.0; initialRisk = 0.0; initialVolume = 0.0;
      flags = 0; partialMask = 0; state = POS_OPEN; dirty = false; seen = false;
   }

   bool IsBuy() const { return type == POSITION_TYPE_BUY; }
   bool HasRisk() const { return initialRisk > 0.0; }
   bool HasFlag(const int f) const { return (flags & f) == f; }
   bool PartialDone(const int level) const { return (partialMask & (1 << level)) != 0; }

   void SetFlag(const int f)
   {
      if(f != 0 && (flags & f) != f)
      {
         flags |= f;
         dirty = true;
      }
   }

   void MarkPartial(const int level)
   {
      if(level >= 0 && !PartialDone(level))
      {
         partialMask |= (1 << level);
         dirty = true;
      }
   }

   // True when the stop sits on the losing side of the entry.
   bool IsRiskSideSL(const double stop) const
   {
      return IsBuy() ? (stop < entry) : (stop > entry);
   }

   void SetInitialSL(const double stop)
   {
      initialSL   = stop;
      initialRisk = MathAbs(entry - stop);
      dirty       = true;
   }

   void ApplySnapshot(const SPositionSnapshot &s)
   {
      ticket   = s.ticket;
      symbol   = s.symbol;
      type     = s.type;
      volume   = s.volume;
      entry    = s.entry;
      sl       = s.sl;
      tp       = s.tp;
      price    = s.price;
      profit   = s.profit;
      magic    = s.magic;
      comment  = s.comment;
      openTime = s.openTime;

      if(volume > initialVolume + TM_EPS)
      {
         initialVolume = volume;
         dirty = true;
      }
      // A stop set by hand on the risk side becomes the reference risk.
      if(initialSL <= 0.0 && sl > 0.0 && IsRiskSideSL(sl))
         SetInitialSL(sl);
      ResolveState();
   }

   // How far the market has moved in favour of the position, in price units.
   double ProfitDistance(const double bid, const double ask) const
   {
      return IsBuy() ? (bid - entry) : (entry - ask);
   }

   void ResolveState()
   {
      if(HasFlag(TM_FLAG_TRAILING))      state = POS_TRAILING;
      else if(partialMask != 0)          state = POS_PARTIAL;
      else if(HasFlag(TM_FLAG_BE))       state = POS_BE_DONE;
      else if(sl > 0.0)                  state = POS_PROTECTED;
      else                               state = POS_OPEN;
   }
};

#endif

#ifndef TM_REQUESTBUILDER_MQH
#define TM_REQUESTBUILDER_MQH

enum ENUM_EXEC_TYPE
{
   EXEC_MODIFY_SL = 0,
   EXEC_MODIFY_TP,
   EXEC_MODIFY_LEVELS,     // SL and TP together, 0 = none (manual use)
   EXEC_CLOSE,
   EXEC_PARTIAL_CLOSE
};

string TM_ExecTypeText(const ENUM_EXEC_TYPE t)
{
   switch(t)
   {
      case EXEC_MODIFY_SL:     return "MODIFY_SL";
      case EXEC_MODIFY_TP:     return "MODIFY_TP";
      case EXEC_MODIFY_LEVELS: return "MODIFY_LEVELS";
      case EXEC_CLOSE:         return "CLOSE";
      case EXEC_PARTIAL_CLOSE: return "PARTIAL_CLOSE";
   }
   return "?";
}

// A request to change one position. `flags`, `level` and `initial` are carried
// through untouched so the caller can update its state once the request succeeds.
struct SExecRequest
{
   ENUM_EXEC_TYPE type;
   ulong          ticket;
   double         sl;
   double         tp;
   double         volume;
   int            level;      // partial level, -1 when not a partial
   int            flags;      // management flags to set on success
   bool           initial;    // sl becomes the position's initial SL on success
   bool           manual;     // typed by the user: never retried, never put on cooldown
   string         reason;

   void Reset()
   {
      type = EXEC_MODIFY_SL; ticket = 0;
      sl = 0.0; tp = 0.0; volume = 0.0;
      level = -1; flags = 0; initial = false; manual = false; reason = "";
   }
};

// A new order typed on the panel. Never produced by the automation.
struct SOrderRequest
{
   ENUM_ORDER_TYPE type;
   string          symbol;
   double          volume;
   double          price;      // pending orders only
   double          sl;         // 0 = none
   double          tp;         // 0 = none
   long            magic;
   string          comment;
};

string TM_OrderText(const ENUM_ORDER_TYPE t)
{
   switch(t)
   {
      case ORDER_TYPE_BUY:        return "BUY";
      case ORDER_TYPE_SELL:       return "SELL";
      case ORDER_TYPE_BUY_LIMIT:  return "BUY LIMIT";
      case ORDER_TYPE_BUY_STOP:   return "BUY STOP";
      case ORDER_TYPE_SELL_LIMIT: return "SELL LIMIT";
      case ORDER_TYPE_SELL_STOP:  return "SELL STOP";
   }
   return "ORDER";
}

class CRequestBuilder
{
public:
   void ModifySL(const ulong ticket, const double sl, const int flags,
                 const string reason, SExecRequest &r) const
   {
      r.Reset();
      r.type = EXEC_MODIFY_SL; r.ticket = ticket; r.sl = sl; r.flags = flags; r.reason = reason;
   }

   void ModifyTP(const ulong ticket, const double tp, const string reason, SExecRequest &r) const
   {
      r.Reset();
      r.type = EXEC_MODIFY_TP; r.ticket = ticket; r.tp = tp; r.reason = reason;
   }

   // Explicit SL and TP for a position. 0 removes a level.
   void ModifyLevels(const ulong ticket, const double sl, const double tp,
                     const string reason, SExecRequest &r) const
   {
      r.Reset();
      r.type = EXEC_MODIFY_LEVELS; r.ticket = ticket; r.sl = sl; r.tp = tp; r.reason = reason; r.manual = true;
   }

   void Close(const ulong ticket, const int level, const string reason, SExecRequest &r) const
   {
      r.Reset();
      r.type = EXEC_CLOSE; r.ticket = ticket; r.level = level; r.reason = reason;
   }

   void PartialClose(const ulong ticket, const double volume, const int level,
                     const string reason, SExecRequest &r) const
   {
      r.Reset();
      r.type = EXEC_PARTIAL_CLOSE; r.ticket = ticket; r.volume = volume; r.level = level; r.reason = reason;
   }
};

#endif


enum ENUM_TRAIL_MODE
{
   TRAIL_FIXED = 0,     // fixed distance behind price
   TRAIL_PERCENT        // give back a percentage of the current profit
};

struct STrailingConfig
{
   bool            enabled;
   ENUM_TRAIL_MODE mode;
   double          activationPoints;  // profit needed before trailing starts
   double          distancePoints;    // TRAIL_FIXED
   double          percent;           // TRAIL_PERCENT
   double          stepPoints;        // the stop only moves in jumps of at least this size
};

// The core only depends on this: how far behind price the stop should sit.
// An ATR-based provider can be plugged in with SetProvider() without touching the core.
class CTrailingDistance
{
public:
   virtual ~CTrailingDistance() {}
   virtual double Distance(CManagedPosition *p, const SSymbolRules &rules, const double profitDistance)
   {
      return 0.0;
   }
};

class CFixedTrailDistance : public CTrailingDistance
{
private:
   double m_points;
public:
   CFixedTrailDistance(const double points) { m_points = points; }
   virtual double Distance(CManagedPosition *p, const SSymbolRules &rules, const double profitDistance)
   {
      return m_points * rules.point;
   }
};

class CPercentTrailDistance : public CTrailingDistance
{
private:
   double m_percent;
public:
   CPercentTrailDistance(const double percent) { m_percent = percent; }
   virtual double Distance(CManagedPosition *p, const SSymbolRules &rules, const double profitDistance)
   {
      return profitDistance * m_percent / 100.0;
   }
};

class CTrailingManager
{
private:
   STrailingConfig    m_cfg;
   CTrailingDistance *m_provider;
   bool               m_ownsProvider;
   CRequestBuilder    m_builder;

   void ReleaseProvider()
   {
      if(m_ownsProvider && m_provider != NULL)
         delete m_provider;
      m_provider = NULL;
      m_ownsProvider = false;
   }

public:
   CTrailingManager() { m_provider = NULL; m_ownsProvider = false; m_cfg.enabled = false; }
   ~CTrailingManager() { ReleaseProvider(); }

   void Configure(const STrailingConfig &cfg)
   {
      m_cfg = cfg;
      ReleaseProvider();
      if(cfg.mode == TRAIL_PERCENT)
         m_provider = new CPercentTrailDistance(cfg.percent);
      else
         m_provider = new CFixedTrailDistance(cfg.distancePoints);
      m_ownsProvider = true;
   }

   void SetEnabled(const bool on) { m_cfg.enabled = on; }
   bool Enabled() const { return m_cfg.enabled; }

   // The caller keeps ownership of an external provider.
   void SetProvider(CTrailingDistance *provider)
   {
      ReleaseProvider();
      m_provider = provider;
   }

   bool Propose(CManagedPosition *p, const SSymbolRules &rules,
                const double bid, const double ask, SExecRequest &req)
   {
      if(!m_cfg.enabled || m_provider == NULL)
         return false;

      const double profit = p.ProfitDistance(bid, ask);
      if(profit <= 0.0 || profit < m_cfg.activationPoints * rules.point)
         return false;

      // Never closer to the market than the broker allows.
      double dist = m_provider.Distance(p, rules, profit);
      dist = MathMax(dist, rules.MinStopDistance() + rules.point);
      if(dist <= 0.0)
         return false;

      const double ref = rules.ClosePrice(p.IsBuy(), bid, ask);
      const double sl = rules.NormalizePrice(p.IsBuy() ? ref - dist : ref + dist);

      if(p.sl > 0.0)
      {
         const double gain = p.IsBuy() ? sl - p.sl : p.sl - sl;
         const double minGain = MathMax(m_cfg.stepPoints * rules.point, rules.tickSize);
         if(gain < minGain - rules.point * 0.1)
            return false;
      }
      if(!rules.IsValidSL(p.IsBuy(), sl, bid, ask))
         return false;

      m_builder.ModifySL(p.ticket, sl, TM_FLAG_TRAILING, "trailing", req);
      return true;
   }
};

#endif



input group "Scope"
input long   InpMagicFilter        = -1;      // Magic number to manage (-1 = all, 0 = manual trades)
input bool   InpChartSymbolOnly    = false;   // Manage only the chart's symbol

input group "Initial stop loss"
input int    InpDefaultSLPoints    = 0;       // SL (points) for positions without one (0 = off)

input group "Break-even"
input bool   InpBEEnabled          = true;    // Enable break-even
input double InpBETriggerR         = 1.0;     // Trigger, in R
input double InpBEOffsetR          = 0.1;     // Locked profit, in R

input group "Trailing"
input bool            InpTrailEnabled    = false;        // Enable trailing
input ENUM_TRAIL_MODE InpTrailMode       = TRAIL_FIXED;  // Distance mode
input int             InpTrailActivation = 200;          // Activation profit (points)
input int             InpTrailDistance   = 100;          // Fixed distance (points)
input double          InpTrailPercent    = 30.0;         // Percent of profit given back
input int             InpTrailStep       = 20;           // Minimum step (points)

input group "Partial close (percent of initial volume)"
input bool   InpPartialEnabled     = false;   // Enable partial closes
input double InpPartial1R          = 1.0;     // Level 1 at (R)
input double InpPartial1Pct        = 50.0;    // Level 1 close (%)
input double InpPartial2R          = 2.0;     // Level 2 at (R)
input double InpPartial2Pct        = 25.0;    // Level 2 close (%)
input double InpPartial3R          = 3.0;     // Level 3 at (R)
input double InpPartial3Pct        = 25.0;    // Level 3 close (%)

input group "Risk guard (0 = off)"
input double InpMaxDailyLossPct    = 0.0;     // Max daily loss (% of day-start balance)
input double InpMaxDrawdownPct     = 0.0;     // Max drawdown from equity peak (%)
input double InpMinEquity          = 0.0;     // Minimum equity
input double InpMinMarginLevel     = 0.0;     // Minimum margin level (%)
input bool   InpCloseAllOnTrip     = false;   // Close all managed positions when a limit trips

input group "Execution"
input int    InpDeviationPoints    = 20;      // Max deviation (points)
input int    InpMaxRetries         = 3;       // Retries after a transient failure
input int    InpRetryDelayMs       = 500;     // Delay before a retry (ms)
input int    InpCooldownMs         = 3000;    // Pause after a failed or refused request (ms)

input group "Order entry (panel buttons)"
input double InpDefaultLot         = 0.01;    // Default lot shown in the panel
input double InpMaxOrderLot        = 0.0;     // Refuse panel orders above this lot (0 = no cap)

input group "Sessions (UTC hours, 0-23; adjust for daylight saving)"
input int    InpSydneyStart        = 22;      // Sydney opens
input int    InpSydneyEnd          = 7;       // Sydney closes
input int    InpTokyoStart         = 0;       // Tokyo opens
input int    InpTokyoEnd           = 9;       // Tokyo closes
input int    InpLondonStart        = 8;       // London opens
input int    InpLondonEnd          = 17;      // London closes
input int    InpNewYorkStart       = 13;      // New York opens
input int    InpNewYorkEnd         = 22;      // New York closes

input group "Runtime"
input int    InpTimerMs            = 1000;    // Timer interval (ms)
input int    InpMinProcessMs       = 100;     // Minimum time between protection passes (ms)
input int    InpPriceFontSize      = 24;      // Size of the big Bid/Ask price (10-28)
input bool   InpKeepPanelOnTop    = true;    // Keep the panel above trade arrows drawn on the chart
input bool   InpShowPanel          = true;    // Show the control panel on the chart
input int    InpPanelX             = 10;      // Panel X (pixels from left)
input int    InpPanelY             = 20;      // Panel Y (pixels from top)
input ENUM_TM_LOG_LEVEL InpLogLevel = TMLOG_INFO;  // Log level

#endif

#ifndef TM_LIFECYCLE_MQH
#define TM_LIFECYCLE_MQH



// Start-up checks and timer handling. No trading logic.
class CLifecycle
{
public:
   bool ValidateInputs(string &why) const
   {
      if(InpBEEnabled)
      {
         if(InpBETriggerR <= 0.0)          { why = "BE trigger must be > 0";         return false; }
         if(InpBEOffsetR < 0.0)            { why = "BE offset must be >= 0";         return false; }
         if(InpBEOffsetR >= InpBETriggerR) { why = "BE offset must be below trigger"; return false; }
      }
      if(InpTrailEnabled)
      {
         if(InpTrailActivation < 0 || InpTrailStep < 0) { why = "trailing activation/step must be >= 0"; return false; }
         if(InpTrailMode == TRAIL_FIXED && InpTrailDistance <= 0)
            { why = "trailing distance must be > 0"; return false; }
         if(InpTrailMode == TRAIL_PERCENT && (InpTrailPercent <= 0.0 || InpTrailPercent >= 100.0))
            { why = "trailing percent must be between 0 and 100"; return false; }
      }
      if(InpPartialEnabled)
      {
         const double total = InpPartial1Pct + InpPartial2Pct + InpPartial3Pct;
         if(InpPartial1Pct < 0.0 || InpPartial2Pct < 0.0 || InpPartial3Pct < 0.0 || total > 100.0)
            { why = "partial percentages must be >= 0 and sum to at most 100"; return false; }
         if(InpPartial1R < 0.0 || InpPartial2R < 0.0 || InpPartial3R < 0.0)
            { why = "partial levels must be >= 0"; return false; }
      }
      int hours[8];
      hours[0] = InpSydneyStart;  hours[1] = InpSydneyEnd;
      hours[2] = InpTokyoStart;   hours[3] = InpTokyoEnd;
      hours[4] = InpLondonStart;  hours[5] = InpLondonEnd;
      hours[6] = InpNewYorkStart; hours[7] = InpNewYorkEnd;
      for(int i = 0; i < 8; i++)
         if(hours[i] < 0 || hours[i] > 23)
            { why = "session hours must be between 0 and 23"; return false; }
      if(InpDefaultSLPoints < 0 || InpMaxRetries < 0 || InpRetryDelayMs < 0 || InpCooldownMs < 0)
         { why = "negative value in stop loss / execution settings"; return false; }
      return true;
   }

   bool StartTimer(const int ms) const
   {
      return EventSetMillisecondTimer(MathMax(ms, 100));
   }

   void StopTimer() const
   {
      EventKillTimer();
   }
};

#endif

#ifndef TM_STATEMANAGER_MQH
#define TM_STATEMANAGER_MQH

#ifndef TM_POSITIONREGISTRY_MQH
#define TM_POSITIONREGISTRY_MQH



// Owns every managed position, keyed by ticket.
class CPositionRegistry
{
private:
   CManagedPosition *m_items[];
   int               m_count;

public:
   CPositionRegistry() { m_count = 0; }
   ~CPositionRegistry() { Clear(); }

   int Count() const { return m_count; }

   CManagedPosition *At(const int index)
   {
      if(index < 0 || index >= m_count)
         return NULL;
      return m_items[index];
   }

   CManagedPosition *Find(const ulong ticket)
   {
      for(int i = 0; i < m_count; i++)
         if(m_items[i].ticket == ticket)
            return m_items[i];
      return NULL;
   }

   CManagedPosition *Add(const SPositionSnapshot &s)
   {
      CManagedPosition *p = new CManagedPosition();
      if(p == NULL)
         return NULL;
      p.ticket = s.ticket;
      ArrayResize(m_items, m_count + 1);
      m_items[m_count++] = p;
      return p;
   }

   void RemoveAt(const int index)
   {
      if(index < 0 || index >= m_count)
         return;
      delete m_items[index];
      for(int i = index; i < m_count - 1; i++)
         m_items[i] = m_items[i + 1];
      m_count--;
      ArrayResize(m_items, m_count);
   }

   void Clear()
   {
      for(int i = 0; i < m_count; i++)
         delete m_items[i];
      m_count = 0;
      ArrayResize(m_items, 0);
   }
};

#endif

#ifndef TM_RECOVERYMANAGER_MQH
#define TM_RECOVERYMANAGER_MQH

#ifndef TM_STATESTORAGE_MQH
#define TM_STATESTORAGE_MQH

// What survives a terminal restart for one position.
struct SStoredState
{
   double   initialSL;
   double   initialRisk;
   double   initialVolume;
   int      flags;
   int      partialMask;
   datetime openTime;
};

// Terminal global variables, namespaced per account:  TM_<login>_<ticket>_<field>
class CStateStorage
{
private:
   string m_prefix;

   string Key(const ulong ticket, const string field) const
   {
      return StringFormat("%s%I64u_%s", m_prefix, ticket, field);
   }

public:
   CStateStorage() { m_prefix = "TM_0_"; }

   void Init(const long login)
   {
      m_prefix = StringFormat("TM_%I64d_", login);
   }

   string AccountKey(const string name) const { return m_prefix + name; }

   bool Save(const ulong ticket, const SStoredState &s)
   {
      const double packed = (double)(s.flags | (s.partialMask << 8));
      return(GlobalVariableSet(Key(ticket, "I"), s.initialSL) != 0 &&
             GlobalVariableSet(Key(ticket, "R"), s.initialRisk) != 0 &&
             GlobalVariableSet(Key(ticket, "V"), s.initialVolume) != 0 &&
             GlobalVariableSet(Key(ticket, "F"), packed) != 0 &&
             GlobalVariableSet(Key(ticket, "T"), (double)s.openTime) != 0);
   }

   bool Load(const ulong ticket, SStoredState &s) const
   {
      if(!GlobalVariableCheck(Key(ticket, "T")))
         return false;
      s.initialSL     = GlobalVariableGet(Key(ticket, "I"));
      s.initialRisk   = GlobalVariableGet(Key(ticket, "R"));
      s.initialVolume = GlobalVariableGet(Key(ticket, "V"));
      const int packed = (int)GlobalVariableGet(Key(ticket, "F"));
      s.flags         = packed & 0xFF;
      s.partialMask   = (packed >> 8) & 0xFF;
      s.openTime      = (datetime)(long)GlobalVariableGet(Key(ticket, "T"));
      return true;
   }

   void Delete(const ulong ticket)
   {
      GlobalVariableDel(Key(ticket, "I"));
      GlobalVariableDel(Key(ticket, "R"));
      GlobalVariableDel(Key(ticket, "V"));
      GlobalVariableDel(Key(ticket, "F"));
      GlobalVariableDel(Key(ticket, "T"));
   }

   // Every ticket that has stored state for this account.
   int ListTickets(ulong &tickets[]) const
   {
      ArrayResize(tickets, 0);
      const int prefixLen = StringLen(m_prefix);
      const int total = GlobalVariablesTotal();
      for(int i = 0; i < total; i++)
      {
         const string name = GlobalVariableName(i);
         if(StringFind(name, m_prefix) != 0 || StringSubstr(name, StringLen(name) - 2) != "_T")
            continue;
         const string mid = StringSubstr(name, prefixLen, StringLen(name) - prefixLen - 2);
         const ulong ticket = (ulong)StringToInteger(mid);
         if(ticket == 0)
            continue;
         const int k = ArraySize(tickets);
         ArrayResize(tickets, k + 1);
         tickets[k] = ticket;
      }
      return ArraySize(tickets);
   }

   double LoadValue(const string name, const double fallback) const
   {
      const string key = AccountKey(name);
      return GlobalVariableCheck(key) ? GlobalVariableGet(key) : fallback;
   }

   void SaveValue(const string name, const double value)
   {
      GlobalVariableSet(AccountKey(name), value);
   }
};

#endif




// Rebuilds management state after a restart. The live MT5 position always wins over
// what was stored: stored state is only accepted if it still matches reality.
class CRecoveryManager
{
private:
   CStateStorage *m_storage;

public:
   CRecoveryManager() { m_storage = NULL; }

   void Attach(CStateStorage *storage) { m_storage = storage; }

   // Called once when a position enters the registry.
   void Restore(CManagedPosition *p)
   {
      SStoredState s;
      const bool have = m_storage.Load(p.ticket, s) &&
                        s.openTime == p.openTime &&
                        s.initialVolume >= p.volume - TM_EPS;

      if(have)
      {
         p.initialSL     = s.initialSL;
         p.initialRisk   = s.initialRisk;
         p.initialVolume = s.initialVolume;
         p.flags         = s.flags;
         p.partialMask   = s.partialMask;
         Logger.Info("Recovery", StringFormat("#%I64u restored: BE=%d partialMask=%d trailing=%d",
                     p.ticket, (int)p.HasFlag(TM_FLAG_BE), p.partialMask, (int)p.HasFlag(TM_FLAG_TRAILING)));
      }
      else
      {
         m_storage.Delete(p.ticket);
         p.initialVolume = p.volume;
         if(p.sl > 0.0 && p.IsRiskSideSL(p.sl))
            p.SetInitialSL(p.sl);
      }

      // A stop already at or beyond the entry can only mean break-even was reached.
      if(!p.HasFlag(TM_FLAG_BE) && p.sl > 0.0 && !p.IsRiskSideSL(p.sl))
         p.SetFlag(TM_FLAG_BE);

      p.dirty = true;
      p.ResolveState();
   }

   void Persist(CManagedPosition *p)
   {
      SStoredState s;
      s.initialSL     = p.initialSL;
      s.initialRisk   = p.initialRisk;
      s.initialVolume = p.initialVolume;
      s.flags         = p.flags;
      s.partialMask   = p.partialMask;
      s.openTime      = p.openTime;
      if(m_storage.Save(p.ticket, s))
         p.dirty = false;
   }

   void Forget(const ulong ticket) { m_storage.Delete(ticket); }

   // Drops stored state for tickets that are no longer open.
   void PurgeOrphans(CPositionRegistry *registry)
   {
      ulong tickets[];
      const int n = m_storage.ListTickets(tickets);
      for(int i = 0; i < n; i++)
      {
         if(registry.Find(tickets[i]) == NULL && !PositionSelectByTicket(tickets[i]))
         {
            m_storage.Delete(tickets[i]);
            Logger.Debug("Recovery", StringFormat("purged stale state for #%I64u", tickets[i]));
         }
      }
   }
};

#endif

#ifndef TM_TIMEUTILS_MQH
#define TM_TIMEUTILS_MQH

// Midnight of the given server time.
datetime TM_DayStart(const datetime t)
{
   const long v = (long)t;
   return (datetime)(v - (v % 86400));
}

ulong TM_NowMs()
{
   return GetTickCount64();
}

#endif


// Writes changed position state to storage and cleans up after closed positions.
class CStateManager
{
private:
   CPositionRegistry *m_registry;
   CRecoveryManager  *m_recovery;
   ulong              m_lastPurgeMs;

public:
   CStateManager() { m_registry = NULL; m_recovery = NULL; m_lastPurgeMs = 0; }

   void Attach(CPositionRegistry *registry, CRecoveryManager *recovery)
   {
      m_registry = registry;
      m_recovery = recovery;
   }

   void Flush()
   {
      for(int i = 0; i < m_registry.Count(); i++)
      {
         CManagedPosition *p = m_registry.At(i);
         if(p.dirty)
            m_recovery.Persist(p);
      }
   }

   // Stale state is only cleaned up once a minute.
   void Purge()
   {
      const ulong now = TM_NowMs();
      if(now - m_lastPurgeMs < 60000)
         return;
      m_lastPurgeMs = now;
      m_recovery.PurgeOrphans(m_registry);
   }
};

#endif

#ifndef TM_EVENTDISPATCHER_MQH
#define TM_EVENTDISPATCHER_MQH


#ifndef TM_POSITIONENGINE_MQH
#define TM_POSITIONENGINE_MQH

#ifndef TM_POSITIONSCANNER_MQH
#define TM_POSITIONSCANNER_MQH



// Reads the open positions that fall inside the configured scope.
class CPositionScanner
{
private:
   CBrokerAdapter *m_broker;
   long            m_magic;        // -1 = every magic number
   bool            m_chartOnly;

public:
   CPositionScanner() { m_broker = NULL; m_magic = -1; m_chartOnly = false; }

   void Attach(CBrokerAdapter *broker) { m_broker = broker; }

   void Configure(const long magicFilter, const bool chartSymbolOnly)
   {
      m_magic     = magicFilter;
      m_chartOnly = chartSymbolOnly;
   }

   bool InScope(const SPositionSnapshot &s) const
   {
      if(m_magic >= 0 && s.magic != m_magic)
         return false;
      if(m_chartOnly && s.symbol != _Symbol)
         return false;
      return true;
   }

   int Scan(SPositionSnapshot &out[])
   {
      ArrayResize(out, 0);
      const int total = m_broker.PositionCount();
      for(int i = 0; i < total; i++)
      {
         SPositionSnapshot s;
         if(!m_broker.PositionAt(i, s) || !InScope(s))
            continue;
         const int k = ArraySize(out);
         ArrayResize(out, k + 1);
         out[k] = s;
      }
      return ArraySize(out);
   }
};

#endif


#ifndef TM_POSITIONSYNCHRONIZER_MQH
#define TM_POSITIONSYNCHRONIZER_MQH






// Makes the registry mirror the real account: adopts new positions, refreshes live
// fields, and forgets positions that are gone.
class CPositionSynchronizer
{
private:
   CPositionScanner  *m_scanner;
   CPositionRegistry *m_registry;
   CRecoveryManager  *m_recovery;

public:
   CPositionSynchronizer() { m_scanner = NULL; m_registry = NULL; m_recovery = NULL; }

   void Attach(CPositionScanner *scanner, CPositionRegistry *registry, CRecoveryManager *recovery)
   {
      m_scanner  = scanner;
      m_registry = registry;
      m_recovery = recovery;
   }

   void Sync()
   {
      SPositionSnapshot snaps[];
      const int n = m_scanner.Scan(snaps);

      for(int i = 0; i < m_registry.Count(); i++)
         m_registry.At(i).seen = false;

      for(int i = 0; i < n; i++)
      {
         CManagedPosition *p = m_registry.Find(snaps[i].ticket);
         if(p == NULL)
         {
            p = m_registry.Add(snaps[i]);
            if(p == NULL)
               continue;
            p.ApplySnapshot(snaps[i]);
            m_recovery.Restore(p);
            Logger.Info("Sync", StringFormat("adopted #%I64u %s %s %.2f lots SL=%s",
                        p.ticket, p.symbol, p.IsBuy() ? "BUY" : "SELL", p.volume,
                        DoubleToString(p.sl, (int)SymbolInfoInteger(p.symbol, SYMBOL_DIGITS))));
         }
         else
            p.ApplySnapshot(snaps[i]);
         p.seen = true;
      }

      for(int i = m_registry.Count() - 1; i >= 0; i--)
      {
         CManagedPosition *p = m_registry.At(i);
         if(p.seen)
            continue;
         Logger.Info("Sync", StringFormat("#%I64u is no longer open", p.ticket));
         m_recovery.Forget(p.ticket);
         m_registry.RemoveAt(i);
      }
   }
};

#endif


// Facade over scanner, registry and synchronizer.
class CPositionEngine
{
private:
   CPositionScanner      m_scanner;
   CPositionRegistry     m_registry;
   CPositionSynchronizer m_sync;

public:
   void Attach(CBrokerAdapter *broker, CRecoveryManager *recovery)
   {
      m_scanner.Attach(broker);
      m_sync.Attach(GetPointer(m_scanner), GetPointer(m_registry), recovery);
   }

   void Configure(const long magicFilter, const bool chartSymbolOnly)
   {
      m_scanner.Configure(magicFilter, chartSymbolOnly);
   }

   void Synchronize() { m_sync.Sync(); }

   CPositionRegistry *Registry() { return GetPointer(m_registry); }
};

#endif

#ifndef TM_PROTECTIONENGINE_MQH
#define TM_PROTECTIONENGINE_MQH

#ifndef TM_STOPLOSSMANAGER_MQH
#define TM_STOPLOSSMANAGER_MQH




struct SStopLossConfig
{
   int defaultSLPoints;     // 0 = leave unprotected positions alone
};

// Owns the initial stop loss.
// Every SL that leaves this module has already passed the broker's stop rules.
class CStopLossManager
{
private:
   SStopLossConfig m_cfg;
   CRequestBuilder m_builder;

public:
   CStopLossManager() { m_cfg.defaultSLPoints = 0; }

   void Configure(const SStopLossConfig &cfg) { m_cfg = cfg; }

   // A position without any stop gets the configured default; that stop also defines its R.
   bool ProposeInitial(CManagedPosition *p, const SSymbolRules &rules,
                       const double bid, const double ask, SExecRequest &req)
   {
      if(m_cfg.defaultSLPoints <= 0 || p.sl > 0.0)
         return false;

      const double dist = m_cfg.defaultSLPoints * rules.point;
      const double sl = rules.NormalizePrice(p.IsBuy() ? p.entry - dist : p.entry + dist);
      if(!rules.IsValidSL(p.IsBuy(), sl, bid, ask))
         return false;

      m_builder.ModifySL(p.ticket, sl, 0, "initial SL", req);
      req.initial = true;
      return true;
   }
};

#endif

#ifndef TM_BREAKEVENMANAGER_MQH
#define TM_BREAKEVENMANAGER_MQH




struct SBreakEvenConfig
{
   bool   enabled;
   double triggerR;    // profit, in multiples of the initial risk, that arms break-even
   double offsetR;     // profit locked once armed, in multiples of the initial risk
};

// Once the trade is triggerR up, move the stop to entry +/- offsetR.
//   BUY, entry 2650, risk 2.5, trigger 1R, offset 0.1R -> arms at 2652.5, SL = 2650.25
class CBreakEvenManager
{
private:
   SBreakEvenConfig m_cfg;
   CRequestBuilder  m_builder;

public:
   CBreakEvenManager() { m_cfg.enabled = false; m_cfg.triggerR = 1.0; m_cfg.offsetR = 0.0; }

   void Configure(const SBreakEvenConfig &cfg) { m_cfg = cfg; }
   void SetEnabled(const bool on) { m_cfg.enabled = on; }
   bool Enabled() const { return m_cfg.enabled; }

   bool Propose(CManagedPosition *p, const SSymbolRules &rules,
                const double bid, const double ask, SExecRequest &req)
   {
      if(!m_cfg.enabled || p.HasFlag(TM_FLAG_BE) || !p.HasRisk())
         return false;

      if(p.ProfitDistance(bid, ask) < m_cfg.triggerR * p.initialRisk)
         return false;

      const double lock = m_cfg.offsetR * p.initialRisk;
      const double sl = rules.NormalizePrice(p.IsBuy() ? p.entry + lock : p.entry - lock);

      // The stop is already at or past break-even (moved by hand, or by trailing).
      if(p.sl > 0.0 && (p.IsBuy() ? p.sl >= sl : p.sl <= sl))
      {
         p.SetFlag(TM_FLAG_BE);
         return false;
      }
      if(!rules.IsValidSL(p.IsBuy(), sl, bid, ask))
         return false;

      m_builder.ModifySL(p.ticket, sl, TM_FLAG_BE, "break-even", req);
      return true;
   }
};

#endif


#ifndef TM_PARTIALCLOSEMANAGER_MQH
#define TM_PARTIALCLOSEMANAGER_MQH




struct SPartialConfig
{
   bool   enabled;
   double levelR[TM_PARTIAL_LEVELS];     // profit, in R, at which the level fires (0 = level off)
   double closePct[TM_PARTIAL_LEVELS];   // percent of the INITIAL volume to close (0 = level off)
};

// Initial 1.00 lot:  1R -> close 0.50,  2R -> close 0.25,  3R -> close 0.25.
// Levels fire strictly in order, one per call.
class CPartialCloseManager
{
private:
   SPartialConfig  m_cfg;
   CRequestBuilder m_builder;

public:
   CPartialCloseManager()
   {
      m_cfg.enabled = false;
      for(int i = 0; i < TM_PARTIAL_LEVELS; i++) { m_cfg.levelR[i] = 0.0; m_cfg.closePct[i] = 0.0; }
   }

   void Configure(const SPartialConfig &cfg) { m_cfg = cfg; }
   void SetEnabled(const bool on) { m_cfg.enabled = on; }
   bool Enabled() const { return m_cfg.enabled; }

   bool Propose(CManagedPosition *p, const SSymbolRules &rules, const SVolumeRules &vol,
                const double bid, const double ask, SExecRequest &req)
   {
      if(!m_cfg.enabled || !p.HasRisk() || p.initialVolume <= 0.0)
         return false;

      const double profit = p.ProfitDistance(bid, ask);

      for(int i = 0; i < TM_PARTIAL_LEVELS; i++)
      {
         if(p.PartialDone(i))
            continue;
         if(m_cfg.levelR[i] <= 0.0 || m_cfg.closePct[i] <= 0.0)
         {
            p.MarkPartial(i);
            continue;
         }
         if(profit < m_cfg.levelR[i] * p.initialRisk)
            return false;

         double v = vol.Normalize(p.initialVolume * m_cfg.closePct[i] / 100.0);
         if(v <= 0.0)                     // share is smaller than one minimum lot
         {
            p.MarkPartial(i);
            continue;
         }

         const string why = StringFormat("partial %d at %.2fR", i + 1, m_cfg.levelR[i]);
         // A remainder below the minimum lot cannot exist, so close what is left.
         if(v >= p.volume - TM_EPS || p.volume - v < vol.minVol - TM_EPS)
            m_builder.Close(p.ticket, i, why, req);
         else
            m_builder.PartialClose(p.ticket, v, i, why, req);
         return true;
      }
      return false;
   }
};

#endif



// Decides what should happen to each managed position. It only produces requests;
// the risk guard and the execution engine decide whether and how they are sent.
class CProtectionEngine
{
private:
   CBrokerAdapter    *m_broker;
   CPositionRegistry *m_registry;

   CStopLossManager     m_sl;
   CBreakEvenManager    m_be;
   CTrailingManager     m_trailing;
   CPartialCloseManager m_partial;

   void Push(SExecRequest &out[], const SExecRequest &r)
   {
      const int k = ArraySize(out);
      ArrayResize(out, k + 1);
      out[k] = r;
   }

public:
   CProtectionEngine() { m_broker = NULL; m_registry = NULL; }

   void Attach(CBrokerAdapter *broker, CPositionRegistry *registry)
   {
      m_broker = broker;
      m_registry = registry;
   }

   void Configure(const SStopLossConfig &sl, const SBreakEvenConfig &be,
                  const STrailingConfig &trail, const SPartialConfig &partial)
   {
      m_sl.Configure(sl);
      m_be.Configure(be);
      m_trailing.Configure(trail);
      m_partial.Configure(partial);
   }

   CTrailingManager *Trailing() { return GetPointer(m_trailing); }

   // Runtime switches (used by the chart panel).
   void SetBEEnabled(const bool on)      { m_be.SetEnabled(on); }
   void SetTrailingEnabled(const bool on){ m_trailing.SetEnabled(on); }
   void SetPartialEnabled(const bool on) { m_partial.SetEnabled(on); }
   bool BEEnabled() const                { return m_be.Enabled(); }
   bool TrailingEnabled() const          { return m_trailing.Enabled(); }
   bool PartialEnabled() const           { return m_partial.Enabled(); }

   // At most one request per position per pass:
   //   partial close  >  initial SL  >  the best of break-even / trailing
   int Process(SExecRequest &out[])
   {
      ArrayResize(out, 0);

      for(int i = 0; i < m_registry.Count(); i++)
      {
         CManagedPosition *p = m_registry.At(i);
         if(p == NULL)
            continue;

         SSymbolRules rules;
         SVolumeRules vol;
         double bid, ask;
         if(!m_broker.LoadRules(p.symbol, rules, vol) || !m_broker.Tick(p.symbol, bid, ask))
            continue;

         SExecRequest r;

         if(m_partial.Propose(p, rules, vol, bid, ask, r))
         {
            Push(out, r);
            continue;
         }

         // Everything below modifies the position, which MT5 forbids inside the freeze level.
         if(rules.IsFrozen(p.IsBuy(), p.sl, p.tp, bid, ask))
            continue;

         if(m_sl.ProposeInitial(p, rules, bid, ask, r))
         {
            Push(out, r);
            continue;
         }

         SExecRequest be, tr;
         const bool hasBE = m_be.Propose(p, rules, bid, ask, be);
         const bool hasTR = m_trailing.Propose(p, rules, bid, ask, tr);

         if(hasBE && hasTR)
         {
            // One modification carries both: the tighter stop wins, and satisfies both.
            SExecRequest best = be;
            if(TM_IsBetterSL(p.IsBuy(), tr.sl, be.sl))
               best = tr;
            best.flags = be.flags | tr.flags;
            Push(out, best);
         }
         else if(hasBE)
            Push(out, be);
         else if(hasTR)
            Push(out, tr);
      }
      return ArraySize(out);
   }

   // Applies a successful request to the position's state.
   void OnExecuted(const SExecRequest &req)
   {
      CManagedPosition *p = m_registry.Find(req.ticket);
      if(p == NULL)
         return;

      switch(req.type)
      {
         case EXEC_MODIFY_SL:
            p.sl = req.sl;
            if(req.initial)
               p.SetInitialSL(req.sl);
            p.SetFlag(req.flags);
            break;
         case EXEC_MODIFY_TP:
            p.tp = req.tp;
            break;
         case EXEC_MODIFY_LEVELS:
            p.sl = req.sl;
            p.tp = req.tp;
            if(req.sl > 0.0 && p.initialSL <= 0.0 && p.IsRiskSideSL(req.sl))
               p.SetInitialSL(req.sl);
            break;
         case EXEC_PARTIAL_CLOSE:
            p.volume -= req.volume;
            p.MarkPartial(req.level);
            break;
         case EXEC_CLOSE:
            p.MarkPartial(req.level);
            break;
      }
      p.ResolveState();
   }
};

#endif

#ifndef TM_RISKENGINE_MQH
#define TM_RISKENGINE_MQH

#ifndef TM_RISKCALCULATOR_MQH
#define TM_RISKCALCULATOR_MQH



struct SAccountRisk
{
   double balance;
   double equity;
   double freeMargin;
   double marginLevel;      // 0 when no margin is in use
   double floating;
   double dailyPL;          // realized today + floating
   double dailyPLPct;       // of the balance at the start of the day
   double dayStartBalance;
};

struct SExposure
{
   int    positions;
   int    unprotected;      // managed positions without a stop loss
   double totalVolume;
   double openRiskMoney;    // what is lost if every current stop is hit
   double openRiskPct;
};

class CRiskCalculator
{
public:
   double MoneyForDistance(const SSymbolRules &rules, const double distance, const double volume) const
   {
      if(rules.tickSize <= 0.0)
         return 0.0;
      return distance / rules.tickSize * rules.tickValue * volume;
   }

   // Money at risk right now: distance from entry to the current stop, if it is still on the losing side.
   double OpenRiskMoney(CManagedPosition *p, const SSymbolRules &rules) const
   {
      if(p.sl <= 0.0 || !p.IsRiskSideSL(p.sl))
         return 0.0;
      return MoneyForDistance(rules, MathAbs(p.entry - p.sl), p.volume);
   }

   // Money the trade was risking when it started: 1R.
   double InitialRiskMoney(CManagedPosition *p, const SSymbolRules &rules) const
   {
      return MoneyForDistance(rules, p.initialRisk, p.initialVolume);
   }

   double Percent(const double money, const double balance) const
   {
      return balance > 0.0 ? money / balance * 100.0 : 0.0;
   }
};

#endif

#ifndef TM_DRAWDOWNMANAGER_MQH
#define TM_DRAWDOWNMANAGER_MQH



// Tracks the equity high-water mark (persisted across restarts) and the drawdown from it.
// To reset the peak, delete the terminal global variable TM_<login>_PEAK.
class CDrawdownManager
{
private:
   CStateStorage *m_storage;
   double         m_peak;
   double         m_savedPeak;

public:
   CDrawdownManager() { m_storage = NULL; m_peak = 0.0; m_savedPeak = 0.0; }

   void Init(CStateStorage *storage, const double equity)
   {
      m_storage = storage;
      m_peak = MathMax(m_storage.LoadValue("PEAK", 0.0), equity);
      m_savedPeak = 0.0;
   }

   void Update(const double equity)
   {
      if(equity > m_peak)
         m_peak = equity;
      if(m_storage != NULL && m_peak > m_savedPeak)
      {
         m_storage.SaveValue("PEAK", m_peak);
         m_savedPeak = m_peak;
      }
   }

   double Peak() const { return m_peak; }

   double DrawdownPct(const double equity) const
   {
      return m_peak > 0.0 ? MathMax(0.0, (m_peak - equity) / m_peak * 100.0) : 0.0;
   }
};

#endif




// Measures the account and the managed positions. It computes; it never acts.
class CRiskEngine
{
private:
   CBrokerAdapter    *m_broker;
   CPositionRegistry *m_registry;
   CRiskCalculator    m_calc;
   CDrawdownManager   m_drawdown;
   double             m_realizedToday;

public:
   SAccountRisk account;
   SExposure    exposure;
   double       drawdownPct;

   CRiskEngine()
   {
      m_broker = NULL; m_registry = NULL; m_realizedToday = 0.0; drawdownPct = 0.0;
      ZeroMemory(account);
      ZeroMemory(exposure);
   }

   void Attach(CBrokerAdapter *broker, CPositionRegistry *registry, CStateStorage *storage)
   {
      m_broker = broker;
      m_registry = registry;
      m_drawdown.Init(storage, broker.Equity());
      Refresh(true);
   }

   double DrawdownPeak() const { return m_drawdown.Peak(); }

   // withHistory re-reads today's deals; it is cheap but not free, so it runs on
   // the timer and on deal events rather than on every tick.
   void Refresh(const bool withHistory)
   {
      if(withHistory)
      {
         const datetime now = TimeCurrent();
         m_realizedToday = m_broker.RealizedResult(TM_DayStart(now), now + 60);
      }

      account.balance     = m_broker.Balance();
      account.equity      = m_broker.Equity();
      account.freeMargin  = m_broker.FreeMargin();
      account.marginLevel = m_broker.MarginLevel();
      account.floating    = m_broker.Floating();
      account.dailyPL     = m_realizedToday + account.floating;
      account.dayStartBalance = account.balance - m_realizedToday;
      account.dailyPLPct  = account.dayStartBalance > 0.0 ? account.dailyPL / account.dayStartBalance * 100.0 : 0.0;

      m_drawdown.Update(account.equity);
      drawdownPct = m_drawdown.DrawdownPct(account.equity);

      exposure.positions = 0;
      exposure.unprotected = 0;
      exposure.totalVolume = 0.0;
      exposure.openRiskMoney = 0.0;
      for(int i = 0; i < m_registry.Count(); i++)
      {
         CManagedPosition *p = m_registry.At(i);
         exposure.positions++;
         exposure.totalVolume += p.volume;
         if(p.sl <= 0.0)
         {
            exposure.unprotected++;
            continue;
         }
         SSymbolRules rules;
         if(rules.Load(p.symbol))
            exposure.openRiskMoney += m_calc.OpenRiskMoney(p, rules);
      }
      exposure.openRiskPct = m_calc.Percent(exposure.openRiskMoney, account.balance);
   }
};

#endif

#ifndef TM_RISKGUARD_MQH
#define TM_RISKGUARD_MQH






enum ENUM_PROTECTION
{
   PROT_NONE = 0,
   PROT_DAILY_LOSS,
   PROT_DRAWDOWN,
   PROT_EQUITY,
   PROT_MARGIN
};

string TM_ProtectionText(const ENUM_PROTECTION p)
{
   switch(p)
   {
      case PROT_NONE:       return "OK";
      case PROT_DAILY_LOSS: return "DAILY LOSS LIMIT";
      case PROT_DRAWDOWN:   return "MAX DRAWDOWN";
      case PROT_EQUITY:     return "MIN EQUITY";
      case PROT_MARGIN:     return "MARGIN LEVEL";
   }
   return "?";
}

struct SRiskLimits
{
   double maxDailyLossPct;   // 0 = off
   double maxDrawdownPct;    // 0 = off
   double minEquity;         // 0 = off
   double minMarginLevel;    // 0 = off
};

// Gatekeeper between "protection wants X" and "execution does X".
// It only ever allows actions that reduce risk or take profit, and it raises the
// account-level protection state. It never opens anything.
class CRiskGuard
{
private:
   CBrokerAdapter  *m_broker;
   SRiskLimits      m_limits;
   ENUM_PROTECTION  m_state;
   datetime         m_latchDay;

public:
   CRiskGuard()
   {
      m_broker = NULL; m_state = PROT_NONE; m_latchDay = 0;
      m_limits.maxDailyLossPct = 0.0; m_limits.maxDrawdownPct = 0.0;
      m_limits.minEquity = 0.0; m_limits.minMarginLevel = 0.0;
   }

   void Attach(CBrokerAdapter *broker) { m_broker = broker; }
   void Configure(const SRiskLimits &limits) { m_limits = limits; }

   ENUM_PROTECTION Status() const { return m_state; }
   bool IsProtectionActive() const { return m_state != PROT_NONE; }

   // Returns true only on the transition into a protection state.
   // A daily-loss trip stays latched until the next server day.
   bool Evaluate(const SAccountRisk &acc, const double drawdownPct)
   {
      const datetime today = TM_DayStart(TimeCurrent());
      ENUM_PROTECTION now = PROT_NONE;

      if(m_state == PROT_DAILY_LOSS && m_latchDay == today)
         now = PROT_DAILY_LOSS;
      else if(m_limits.maxDailyLossPct > 0.0 && acc.dailyPLPct <= -m_limits.maxDailyLossPct)
         now = PROT_DAILY_LOSS;
      else if(m_limits.maxDrawdownPct > 0.0 && drawdownPct >= m_limits.maxDrawdownPct)
         now = PROT_DRAWDOWN;
      else if(m_limits.minEquity > 0.0 && acc.equity <= m_limits.minEquity)
         now = PROT_EQUITY;
      else if(m_limits.minMarginLevel > 0.0 && acc.marginLevel > 0.0 && acc.marginLevel <= m_limits.minMarginLevel)
         now = PROT_MARGIN;

      if(now == PROT_DAILY_LOSS)
         m_latchDay = today;

      const bool tripped = (m_state == PROT_NONE && now != PROT_NONE);
      m_state = now;
      return tripped;
   }

   bool CanAct(string &why) const
   {
      if(!m_broker.IsTradeAllowed())
      {
         why = "trading not allowed (terminal, account or algo trading)";
         return false;
      }
      return true;
   }

   // New orders are refused while an account-level protection is active.
   bool CanOpen(string &why) const
   {
      if(!CanAct(why))
         return false;
      if(m_state != PROT_NONE)
      {
         why = "protection active: " + TM_ProtectionText(m_state);
         return false;
      }
      return true;
   }

   // A stop may only move towards safety; it can never be widened or removed.
   bool CanModify(CManagedPosition *p, const double newSL, string &why) const
   {
      if(!CanAct(why))
         return false;
      if(newSL <= 0.0)
      {
         why = "refusing to remove a stop loss";
         return false;
      }
      if(p.sl > 0.0 && !TM_IsBetterSL(p.IsBuy(), newSL, p.sl))
      {
         why = "new stop loss would not reduce risk";
         return false;
      }
      return true;
   }

   bool CanClose(CManagedPosition *p, string &why) const
   {
      return CanAct(why);
   }

   bool CanPartialClose(CManagedPosition *p, const double volume, string &why) const
   {
      if(!CanAct(why))
         return false;
      if(volume <= 0.0 || volume >= p.volume - TM_EPS)
      {
         why = "partial volume must be smaller than the position";
         return false;
      }
      return true;
   }
};

#endif

#ifndef TM_EXECUTIONENGINE_MQH
#define TM_EXECUTIONENGINE_MQH


#ifndef TM_ERRORHANDLER_MQH
#define TM_ERRORHANDLER_MQH

enum ENUM_ERR_ACTION
{
   EXA_SUCCESS = 0,
   EXA_NO_RETRY,        // the request itself is wrong; do not resend it
   EXA_RETRY_NOW,       // transient; try again after a short delay
   EXA_RETRY_LATER,     // blocked by market state; try again after a long delay
   EXA_REFRESH_STATE    // our picture of the position is stale; resynchronize
};

class CErrorHandler
{
public:
   ENUM_ERR_ACTION Classify(const uint retcode, const int lastError) const
   {
      switch(retcode)
      {
         case TRADE_RETCODE_DONE:
         case TRADE_RETCODE_DONE_PARTIAL:
         case TRADE_RETCODE_PLACED:
         case TRADE_RETCODE_NO_CHANGES:
            return EXA_SUCCESS;

         case TRADE_RETCODE_REQUOTE:
         case TRADE_RETCODE_PRICE_CHANGED:
         case TRADE_RETCODE_PRICE_OFF:
         case TRADE_RETCODE_REJECT:
         case TRADE_RETCODE_TIMEOUT:
         case TRADE_RETCODE_CONNECTION:
         case TRADE_RETCODE_TOO_MANY_REQUESTS:
         case TRADE_RETCODE_LOCKED:
         case TRADE_RETCODE_ERROR:
            return EXA_RETRY_NOW;

         case TRADE_RETCODE_MARKET_CLOSED:
         case TRADE_RETCODE_FROZEN:
         case TRADE_RETCODE_SERVER_DISABLES_AT:
         case TRADE_RETCODE_CLIENT_DISABLES_AT:
         case TRADE_RETCODE_TRADE_DISABLED:
            return EXA_RETRY_LATER;

         case TRADE_RETCODE_POSITION_CLOSED:
            return EXA_REFRESH_STATE;

         case TRADE_RETCODE_INVALID_STOPS:
         case TRADE_RETCODE_INVALID_VOLUME:
         case TRADE_RETCODE_INVALID_PRICE:
         case TRADE_RETCODE_INVALID:
         case TRADE_RETCODE_INVALID_FILL:
         case TRADE_RETCODE_NO_MONEY:
            return EXA_NO_RETRY;
      }

      // No retcode at all: the request never reached the server.
      if(retcode == 0)
         return EXA_RETRY_LATER;

      return EXA_NO_RETRY;
   }

   string Describe(const uint retcode) const
   {
      switch(retcode)
      {
         case TRADE_RETCODE_DONE:               return "done";
         case TRADE_RETCODE_DONE_PARTIAL:       return "done partially";
         case TRADE_RETCODE_NO_CHANGES:         return "no changes";
         case TRADE_RETCODE_REQUOTE:            return "requote";
         case TRADE_RETCODE_REJECT:             return "rejected";
         case TRADE_RETCODE_INVALID_STOPS:      return "invalid stops";
         case TRADE_RETCODE_INVALID_VOLUME:     return "invalid volume";
         case TRADE_RETCODE_INVALID_PRICE:      return "invalid price";
         case TRADE_RETCODE_TRADE_DISABLED:     return "trading disabled";
         case TRADE_RETCODE_MARKET_CLOSED:      return "market closed";
         case TRADE_RETCODE_NO_MONEY:           return "not enough money";
         case TRADE_RETCODE_TOO_MANY_REQUESTS:  return "too many requests";
         case TRADE_RETCODE_FROZEN:             return "frozen";
         case TRADE_RETCODE_CONNECTION:         return "no connection";
         case TRADE_RETCODE_POSITION_CLOSED:    return "position closed";
      }
      return StringFormat("retcode %u", retcode);
   }
};

#endif

#ifndef TM_RETRYMANAGER_MQH
#define TM_RETRYMANAGER_MQH




// A queued retry, or a cooldown that keeps an identical request from being sent again.
struct SRetryEntry
{
   SExecRequest req;
   int          attempts;
   ulong        dueMs;
   bool         cooldown;
};

// Pure queue: it holds requests and says when they are due. The ExecutionEngine sends them.
class CRetryManager
{
private:
   SRetryEntry m_q[];
   int         m_n;

   int IndexOf(const ulong ticket, const ENUM_EXEC_TYPE type) const
   {
      for(int i = 0; i < m_n; i++)
         if(m_q[i].req.ticket == ticket && m_q[i].req.type == type)
            return i;
      return -1;
   }

   void RemoveAt(const int index)
   {
      for(int i = index; i < m_n - 1; i++)
         m_q[i] = m_q[i + 1];
      m_n--;
      ArrayResize(m_q, m_n);
   }

   void Put(const SRetryEntry &e)
   {
      const int idx = IndexOf(e.req.ticket, e.req.type);
      if(idx >= 0)
      {
         m_q[idx] = e;
         return;
      }
      ArrayResize(m_q, m_n + 1);
      m_q[m_n++] = e;
   }

public:
   CRetryManager() { m_n = 0; }

   // True while a retry is pending or a cooldown has not yet expired.
   bool IsBlocked(const ulong ticket, const ENUM_EXEC_TYPE type) const
   {
      const int idx = IndexOf(ticket, type);
      if(idx < 0)
         return false;
      if(m_q[idx].cooldown && TM_NowMs() >= m_q[idx].dueMs)
         return false;
      return true;
   }

   void Schedule(const SExecRequest &req, const int attempts, const ulong delayMs)
   {
      SRetryEntry e;
      e.req = req; e.attempts = attempts; e.dueMs = TM_NowMs() + delayMs; e.cooldown = false;
      Put(e);
   }

   void Cooldown(const SExecRequest &req, const ulong ms)
   {
      SRetryEntry e;
      e.req = req; e.attempts = 0; e.dueMs = TM_NowMs() + ms; e.cooldown = true;
      Put(e);
   }

   void Clear(const ulong ticket, const ENUM_EXEC_TYPE type)
   {
      const int idx = IndexOf(ticket, type);
      if(idx >= 0)
         RemoveAt(idx);
   }

   // Removes and returns the first retry that is due.
   bool PopDue(SRetryEntry &out)
   {
      const ulong now = TM_NowMs();
      for(int i = 0; i < m_n; i++)
      {
         if(!m_q[i].cooldown && now >= m_q[i].dueMs)
         {
            out = m_q[i];
            RemoveAt(i);
            return true;
         }
      }
      return false;
   }

   void Prune()
   {
      const ulong now = TM_NowMs();
      for(int i = m_n - 1; i >= 0; i--)
         if(m_q[i].cooldown && now >= m_q[i].dueMs)
            RemoveAt(i);
   }

   int Pending() const { return m_n; }
};

#endif

#ifndef TM_EXECUTIONVALIDATOR_MQH
#define TM_EXECUTIONVALIDATOR_MQH





// Last line of defence: nothing invalid is ever sent to MT5.
// It checks the request against the live position, prices and symbol rules,
// and normalizes prices and volumes in place.
class CExecutionValidator
{
private:
   CBrokerAdapter *m_broker;

public:
   CExecutionValidator() { m_broker = NULL; }

   void Attach(CBrokerAdapter *broker) { m_broker = broker; }

   // Checks a new order against lot rules, the market and the broker's stop distance.
   // Prices and volume are normalized in place. maxLot <= 0 means no cap.
   bool ValidateOrder(SOrderRequest &req, const double maxLot, string &why)
   {
      SSymbolRules rules;
      SVolumeRules vol;
      if(!m_broker.LoadRules(req.symbol, rules, vol))
      {
         why = "symbol rules unavailable";
         return false;
      }
      double bid, ask;
      if(!m_broker.Tick(req.symbol, bid, ask))
      {
         why = "no tick";
         return false;
      }

      const bool isBuy = (req.type == ORDER_TYPE_BUY || req.type == ORDER_TYPE_BUY_LIMIT || req.type == ORDER_TYPE_BUY_STOP);
      const bool pending = (req.type != ORDER_TYPE_BUY && req.type != ORDER_TYPE_SELL);
      const double minD = rules.MinStopDistance();
      const double tol = rules.point * 0.5;

      const double requested = req.volume;
      req.volume = vol.Normalize(requested);
      if(req.volume <= 0.0)
      {
         why = StringFormat("lot %.2f is below the minimum %.2f (step %.2f)", requested, vol.minVol, vol.step);
         return false;
      }
      if(maxLot > 0.0 && req.volume > maxLot + TM_EPS)
      {
         why = StringFormat("lot %.2f exceeds the order cap %.2f", req.volume, maxLot);
         return false;
      }
      if(req.sl < 0.0 || req.tp < 0.0 || req.price < 0.0)
      {
         why = "negative price";
         return false;
      }
      if(req.sl > 0.0) req.sl = rules.NormalizePrice(req.sl);
      if(req.tp > 0.0) req.tp = rules.NormalizePrice(req.tp);

      double ref;                         // the level SL and TP are measured from
      if(pending)
      {
         if(req.price <= 0.0)
         {
            why = "a pending order needs a price";
            return false;
         }
         req.price = rules.NormalizePrice(req.price);
         bool ok = false;
         switch(req.type)
         {
            case ORDER_TYPE_BUY_LIMIT:  ok = (ask - req.price >= minD - tol) && req.price < ask; break;
            case ORDER_TYPE_BUY_STOP:   ok = (req.price - ask >= minD - tol) && req.price > ask; break;
            case ORDER_TYPE_SELL_LIMIT: ok = (req.price - bid >= minD - tol) && req.price > bid; break;
            case ORDER_TYPE_SELL_STOP:  ok = (bid - req.price >= minD - tol) && req.price < bid; break;
         }
         if(!ok)
         {
            why = StringFormat("%s price %s is on the wrong side of the market or closer than %d points",
                               TM_OrderText(req.type), DoubleToString(req.price, rules.digits), (int)rules.stopsPoints);
            return false;
         }
         ref = req.price;
      }
      else
         ref = isBuy ? bid : ask;

      if(req.sl > 0.0)
      {
         const double d = isBuy ? ref - req.sl : req.sl - ref;
         if(d <= 0.0 || d < minD - tol)
         {
            why = StringFormat("SL %s is on the wrong side or closer than %d points", DoubleToString(req.sl, rules.digits), (int)rules.stopsPoints);
            return false;
         }
      }
      if(req.tp > 0.0)
      {
         const double d = isBuy ? req.tp - ref : ref - req.tp;
         if(d <= 0.0 || d < minD - tol)
         {
            why = StringFormat("TP %s is on the wrong side or closer than %d points", DoubleToString(req.tp, rules.digits), (int)rules.stopsPoints);
            return false;
         }
      }
      return true;
   }

   bool Validate(SExecRequest &req, string &why, ENUM_ERR_ACTION &action)
   {
      action = EXA_NO_RETRY;

      SPositionSnapshot pos;
      if(!m_broker.PositionByTicket(req.ticket, pos))
      {
         why = "position not found";
         action = EXA_REFRESH_STATE;
         return false;
      }

      SSymbolRules rules;
      SVolumeRules vol;
      if(!m_broker.LoadRules(pos.symbol, rules, vol))
      {
         why = "symbol rules unavailable";
         action = EXA_RETRY_LATER;
         return false;
      }

      double bid, ask;
      if(!m_broker.Tick(pos.symbol, bid, ask))
      {
         why = "no tick";
         action = EXA_RETRY_LATER;
         return false;
      }

      const bool isBuy = (pos.type == POSITION_TYPE_BUY);

      switch(req.type)
      {
         case EXEC_MODIFY_SL:
         {
            req.sl = rules.NormalizePrice(req.sl);
            if(MathAbs(req.sl - pos.sl) < rules.point * 0.5)
            {
               why = "stop loss already at requested level";
               action = EXA_REFRESH_STATE;
               return false;
            }
            if(!rules.IsValidSL(isBuy, req.sl, bid, ask))
            {
               why = StringFormat("SL %s violates minimum stop distance", DoubleToString(req.sl, rules.digits));
               return false;
            }
            if(rules.IsFrozen(isBuy, pos.sl, pos.tp, bid, ask))
            {
               why = "position is inside the freeze level";
               action = EXA_RETRY_LATER;
               return false;
            }
            return true;
         }

         case EXEC_MODIFY_TP:
         {
            req.tp = rules.NormalizePrice(req.tp);
            if(!rules.IsValidTP(isBuy, req.tp, bid, ask))
            {
               why = StringFormat("TP %s violates minimum stop distance", DoubleToString(req.tp, rules.digits));
               return false;
            }
            if(rules.IsFrozen(isBuy, pos.sl, pos.tp, bid, ask))
            {
               why = "position is inside the freeze level";
               action = EXA_RETRY_LATER;
               return false;
            }
            return true;
         }

         case EXEC_MODIFY_LEVELS:
         {
            if(req.sl < 0.0 || req.tp < 0.0)
            {
               why = "negative price";
               return false;
            }
            if(req.sl > 0.0) req.sl = rules.NormalizePrice(req.sl);
            if(req.tp > 0.0) req.tp = rules.NormalizePrice(req.tp);

            const bool slChanged = MathAbs(req.sl - pos.sl) >= rules.point * 0.5;
            const bool tpChanged = MathAbs(req.tp - pos.tp) >= rules.point * 0.5;
            if(!slChanged && !tpChanged)
            {
               why = "levels already as requested";
               return false;
            }
            // Only levels that actually change are checked: an untouched one may already
            // sit inside the stop distance after the market moved.
            if(slChanged && req.sl > 0.0 && !rules.IsValidSL(isBuy, req.sl, bid, ask))
            {
               why = StringFormat("SL %s violates minimum stop distance", DoubleToString(req.sl, rules.digits));
               return false;
            }
            if(tpChanged && req.tp > 0.0 && !rules.IsValidTP(isBuy, req.tp, bid, ask))
            {
               why = StringFormat("TP %s violates minimum stop distance", DoubleToString(req.tp, rules.digits));
               return false;
            }
            if(rules.IsFrozen(isBuy, pos.sl, pos.tp, bid, ask))
            {
               why = "position is inside the freeze level";
               action = EXA_RETRY_LATER;
               return false;
            }
            return true;
         }

         case EXEC_PARTIAL_CLOSE:
         {
            req.volume = vol.Normalize(req.volume);
            if(req.volume <= 0.0)
            {
               why = "partial volume below minimum lot";
               return false;
            }
            if(req.volume >= pos.volume - TM_EPS)
            {
               why = "partial volume covers the whole position";
               action = EXA_REFRESH_STATE;
               return false;
            }
            if(pos.volume - req.volume < vol.minVol - TM_EPS)
            {
               why = "remaining volume would be below minimum lot";
               return false;
            }
            return true;
         }

         case EXEC_CLOSE:
            return true;
      }

      why = "unknown request type";
      return false;
   }
};

#endif




struct SExecutionConfig
{
   int maxRetries;       // attempts after the first failure
   int retryDelayMs;     // for transient errors
   int laterDelayMs;     // for market-state errors
   int cooldownMs;       // after a non-retryable failure or after giving up
   double maxOrderLot;   // cap for panel orders, 0 = none
};

struct SExecOutcome
{
   SExecRequest    req;
   bool            success;
   bool            deferred;     // not attempted: same request is in retry/cooldown
   ENUM_ERR_ACTION action;
   uint            retcode;
   string          message;
};

// Request -> validate -> CTrade -> classify the result -> retry or cool down.
class CExecutionEngine
{
private:
   CBrokerAdapter     *m_broker;
   CExecutionValidator m_validator;
   CErrorHandler       m_errors;
   CRetryManager       m_retry;
   CRequestBuilder     m_builder;
   SExecutionConfig    m_cfg;
   bool                m_refresh;

   void Send(const SExecRequest &req, uint &retcode, int &error)
   {
      SPositionSnapshot live;
      if(!m_broker.PositionByTicket(req.ticket, live))
      {
         retcode = TRADE_RETCODE_POSITION_CLOSED;
         error = 0;
         return;
      }

      // Modify always re-sends the other level unchanged, read fresh just now.
      switch(req.type)
      {
         case EXEC_MODIFY_SL:     m_broker.ModifyPosition(req.ticket, req.sl, live.tp); break;
         case EXEC_MODIFY_TP:     m_broker.ModifyPosition(req.ticket, live.sl, req.tp); break;
         case EXEC_MODIFY_LEVELS: m_broker.ModifyPosition(req.ticket, req.sl, req.tp); break;
         case EXEC_CLOSE:         m_broker.ClosePosition(req.ticket, 0.0); break;
         case EXEC_PARTIAL_CLOSE: m_broker.ClosePosition(req.ticket, req.volume); break;
      }
      retcode = m_broker.LastRetcode();
      error   = m_broker.LastError();
   }

   void ScheduleRetry(const SExecRequest &req, const int attempts, const int delayMs)
   {
      if(attempts > m_cfg.maxRetries)
      {
         Logger.Warn("Exec", StringFormat("giving up on #%I64u %s after %d attempts",
                     req.ticket, TM_ExecTypeText(req.type), attempts));
         m_retry.Cooldown(req, (ulong)m_cfg.cooldownMs);
         return;
      }
      m_retry.Schedule(req, attempts, (ulong)delayMs);
   }

   void HandleFailure(const SExecRequest &req, const int attempt, const ENUM_ERR_ACTION action)
   {
      // A request the user typed is reported and dropped, so they can correct it and try again at once.
      if(req.manual)
      {
         if(action == EXA_REFRESH_STATE)
            m_refresh = true;
         return;
      }
      switch(action)
      {
         case EXA_RETRY_NOW:
            ScheduleRetry(req, attempt + 1, m_cfg.retryDelayMs);
            break;
         case EXA_RETRY_LATER:
            ScheduleRetry(req, attempt + 1, m_cfg.laterDelayMs);
            break;
         case EXA_REFRESH_STATE:
            m_refresh = true;
            m_retry.Cooldown(req, 1000);
            break;
         default:
            m_retry.Cooldown(req, (ulong)m_cfg.cooldownMs);
            break;
      }
   }

   void Attempt(SExecRequest &req, const int attempt, SExecOutcome &out)
   {
      out.req = req;
      out.success = false;
      out.deferred = false;
      out.action = EXA_NO_RETRY;
      out.retcode = 0;
      out.message = "";

      string why;
      ENUM_ERR_ACTION action;
      if(!m_validator.Validate(req, why, action))
      {
         out.req = req;
         out.action = action;
         out.message = why;
         Logger.Warn("Exec", StringFormat("#%I64u %s rejected before sending: %s",
                     req.ticket, TM_ExecTypeText(req.type), why));
         HandleFailure(req, attempt, action);
         return;
      }
      out.req = req;

      uint retcode = 0;
      int error = 0;
      Send(req, retcode, error);
      action = m_errors.Classify(retcode, error);
      out.retcode = retcode;
      out.action = action;
      out.message = m_errors.Describe(retcode);

      if(action == EXA_SUCCESS)
      {
         out.success = true;
         m_retry.Clear(req.ticket, req.type);
         Logger.Info("Exec", StringFormat("#%I64u %s ok (%s) sl=%.5f vol=%.2f",
                     req.ticket, TM_ExecTypeText(req.type), req.reason, req.sl, req.volume));
         return;
      }

      Logger.Warn("Exec", StringFormat("#%I64u %s failed: %s (err %d)",
                  req.ticket, TM_ExecTypeText(req.type), out.message, error));
      HandleFailure(req, attempt, action);
   }

public:
   CExecutionEngine()
   {
      m_broker = NULL;
      m_refresh = false;
      m_cfg.maxRetries = 3; m_cfg.retryDelayMs = 500; m_cfg.laterDelayMs = 5000; m_cfg.cooldownMs = 3000; m_cfg.maxOrderLot = 0.0;
   }

   void Attach(CBrokerAdapter *broker)
   {
      m_broker = broker;
      m_validator.Attach(broker);
   }

   void Configure(const SExecutionConfig &cfg) { m_cfg = cfg; }

   bool ValidateRequest(SExecRequest &req, string &why)
   {
      ENUM_ERR_ACTION action;
      return m_validator.Validate(req, why, action);
   }

   // Sends a request unless the same one is already waiting for a retry or cooling down.
   bool Submit(SExecRequest &req, SExecOutcome &out)
   {
      if(!req.manual && m_retry.IsBlocked(req.ticket, req.type))
      {
         out.req = req;
         out.success = false;
         out.deferred = true;
         out.action = EXA_NO_RETRY;
         out.retcode = 0;
         out.message = "deferred";
         return false;
      }
      Attempt(req, 0, out);
      return out.success;
   }

   bool IsBusy(const ulong ticket, const ENUM_EXEC_TYPE type) const
   {
      return m_retry.IsBlocked(ticket, type);
   }

   // Holds a request back without sending it (e.g. blocked by the risk guard).
   void Defer(const SExecRequest &req, const int ms)
   {
      m_retry.Cooldown(req, (ulong)ms);
   }

   // Re-sends whatever is due. Successful outcomes are returned so the caller can update state.
   void ProcessRetries(SExecOutcome &done[])
   {
      ArrayResize(done, 0);
      m_retry.Prune();

      SRetryEntry e;
      int guard = 0;
      while(guard < 16 && m_retry.PopDue(e))
      {
         guard++;
         SExecOutcome o;
         Attempt(e.req, e.attempts, o);
         if(o.success)
         {
            const int k = ArraySize(done);
            ArrayResize(done, k + 1);
            done[k] = o;
         }
      }
   }

   // True once after a failure that means the registry is out of date.
   bool ConsumeRefreshRequest()
   {
      const bool r = m_refresh;
      m_refresh = false;
      return r;
   }

   // A new order from the panel. Validated, sent once, never retried: the user decides whether to press again.
   bool PlaceOrder(SOrderRequest &req, string &msg)
   {
      string why;
      if(!m_validator.ValidateOrder(req, m_cfg.maxOrderLot, why))
      {
         msg = TM_OrderText(req.type) + " rejected: " + why;
         Logger.Warn("Order", msg);
         return false;
      }
      m_broker.SendOrder(req.type, req.symbol, req.volume, req.price, req.sl, req.tp, req.magic, req.comment);
      const uint rc = m_broker.LastRetcode();
      const ENUM_ERR_ACTION action = m_errors.Classify(rc, m_broker.LastError());
      if(action == EXA_SUCCESS)
      {
         msg = StringFormat("%s %.2f %s sent", TM_OrderText(req.type), req.volume, req.symbol);
         Logger.Info("Order", msg);
         return true;
      }
      msg = StringFormat("%s failed: %s", TM_OrderText(req.type), m_errors.Describe(rc));
      Logger.Warn("Order", msg);
      return false;
   }

   // ---- convenience wrappers ------------------------------------------------
   bool ModifySL(const ulong ticket, const double sl, SExecOutcome &out)
   {
      SExecRequest r;
      m_builder.ModifySL(ticket, sl, 0, "manual", r);
      return Submit(r, out);
   }

   bool ModifyTP(const ulong ticket, const double tp, SExecOutcome &out)
   {
      SExecRequest r;
      m_builder.ModifyTP(ticket, tp, "manual", r);
      return Submit(r, out);
   }

   bool Close(const ulong ticket, SExecOutcome &out)
   {
      SExecRequest r;
      m_builder.Close(ticket, -1, "manual", r);
      return Submit(r, out);
   }

   bool PartialClose(const ulong ticket, const double volume, SExecOutcome &out)
   {
      SExecRequest r;
      m_builder.PartialClose(ticket, volume, -1, "manual", r);
      return Submit(r, out);
   }
};

#endif


// Routes each MT5 event to the right modules and runs the fixed pipeline:
//   registry -> protection -> risk guard -> execution -> state.
class CEventDispatcher
{
private:
   CPositionEngine   *m_positions;
   CProtectionEngine *m_protection;
   CRiskEngine       *m_risk;
   CRiskGuard        *m_guard;
   CExecutionEngine  *m_exec;
   CStateManager     *m_state;

   ulong m_lastPassMs;
   ulong m_minPassMs;
   int   m_deferMs;
   bool  m_closeAllOnTrip;
   bool  m_paused;
   double m_beOffsetR;
   long   m_orderMagic;

   void ApplySuccesses(SExecOutcome &done[])
   {
      for(int i = 0; i < ArraySize(done); i++)
         m_protection.OnExecuted(done[i].req);
   }

   // Guard check, then execution. Returns silently if the same request is already waiting.
   void Dispatch(SExecRequest &req)
   {
      CManagedPosition *p = m_positions.Registry().Find(req.ticket);
      if(p == NULL || m_exec.IsBusy(req.ticket, req.type))
         return;

      string why = "";
      bool allowed = false;
      switch(req.type)
      {
         case EXEC_MODIFY_SL:     allowed = m_guard.CanModify(p, req.sl, why); break;
         case EXEC_PARTIAL_CLOSE: allowed = m_guard.CanPartialClose(p, req.volume, why); break;
         case EXEC_CLOSE:         allowed = m_guard.CanClose(p, why); break;
         default:                 allowed = m_guard.CanAct(why); break;
      }
      if(!allowed)
      {
         Logger.Debug("Guard", StringFormat("#%I64u %s blocked: %s", req.ticket, TM_ExecTypeText(req.type), why));
         m_exec.Defer(req, m_deferMs);
         return;
      }

      SExecOutcome out;
      if(m_exec.Submit(req, out))
         m_protection.OnExecuted(out.req);
   }

   void CloseAllManaged(const string reason)
   {
      CRequestBuilder builder;
      CPositionRegistry *reg = m_positions.Registry();
      for(int i = 0; i < reg.Count(); i++)
      {
         CManagedPosition *p = reg.At(i);
         SExecRequest r;
         builder.Close(p.ticket, -1, reason, r);
         string why;
         if(!m_guard.CanClose(p, why))
         {
            Logger.Warn("Guard", StringFormat("cannot close #%I64u: %s", p.ticket, why));
            continue;
         }
         SExecOutcome out;
         m_exec.Submit(r, out);
      }
   }

   void EvaluateGuard()
   {
      if(m_guard.Evaluate(m_risk.account, m_risk.drawdownPct))
      {
         const string text = TM_ProtectionText(m_guard.Status());
         Logger.Error("Guard", "TRADING PROTECTION: " + text);
         Alert("Trade Manager: TRADING PROTECTION - ", text);
         if(m_closeAllOnTrip)
            CloseAllManaged("protection: " + text);
      }
   }

   void RunCycle(const bool force)
   {
      const ulong now = TM_NowMs();
      if(!force && now - m_lastPassMs < m_minPassMs)
         return;
      m_lastPassMs = now;

      m_risk.Refresh(false);
      EvaluateGuard();

      if(!m_paused)
      {
         SExecOutcome done[];
         m_exec.ProcessRetries(done);
         ApplySuccesses(done);

         SExecRequest reqs[];
         const int n = m_protection.Process(reqs);
         for(int i = 0; i < n; i++)
            Dispatch(reqs[i]);
      }

      m_state.Flush();

      if(m_exec.ConsumeRefreshRequest())
         m_positions.Synchronize();
   }

public:
   CEventDispatcher()
   {
      m_positions = NULL; m_protection = NULL; m_risk = NULL; m_guard = NULL; m_exec = NULL; m_state = NULL;
      m_lastPassMs = 0; m_minPassMs = 100; m_deferMs = 3000; m_closeAllOnTrip = false;
      m_paused = false; m_beOffsetR = 0.0; m_orderMagic = 0;
   }

   void Attach(CPositionEngine *positions, CProtectionEngine *protection, CRiskEngine *risk,
               CRiskGuard *guard, CExecutionEngine *exec, CStateManager *state)
   {
      m_positions = positions; m_protection = protection; m_risk = risk;
      m_guard = guard; m_exec = exec; m_state = state;
   }

   void Configure(const int minPassMs, const int deferMs, const bool closeAllOnTrip, const double beOffsetR)
   {
      m_beOffsetR = beOffsetR;
      m_minPassMs = (ulong)minPassMs;
      m_deferMs = deferMs;
      m_closeAllOnTrip = closeAllOnTrip;
   }

   // ---- manual actions (chart panel) ---------------------------------------
   // While paused, no automatic action is taken; manual actions still work.
   void SetPaused(const bool paused) { m_paused = paused; }
   bool IsPaused() const { return m_paused; }

   void SetOrderMagic(const long magic) { m_orderMagic = magic; }

   // Entry typed on the panel. Automation never calls this.
   bool ManualOrder(const ENUM_ORDER_TYPE type, const double lot, const double price,
                    const double sl, const double tp, const string symbol, string &msg)
   {
      string why;
      if(!m_guard.CanOpen(why))
      {
         msg = TM_OrderText(type) + " blocked: " + why;
         Logger.Warn("Order", msg);
         return false;
      }
      SOrderRequest r;
      r.type = type; r.symbol = symbol; r.volume = lot; r.price = price;
      r.sl = sl; r.tp = tp; r.magic = m_orderMagic; r.comment = "TradeManager";
      return m_exec.PlaceOrder(r, msg);
   }

   void ManualCloseAll()
   {
      Logger.Info("Manual", "close all managed positions");
      CloseAllManaged("manual close all");
   }

   // Moves each stop to entry (+ configured offset). Positions not far enough in profit are refused by validation.
   void ManualBreakEven()
   {
      Logger.Info("Manual", "break-even on all managed positions");
      CRequestBuilder builder;
      CPositionRegistry *reg = m_positions.Registry();
      for(int i = 0; i < reg.Count(); i++)
      {
         CManagedPosition *p = reg.At(i);
         const double lock = p.initialRisk * m_beOffsetR;
         SExecRequest r;
         builder.ModifySL(p.ticket, p.IsBuy() ? p.entry + lock : p.entry - lock, TM_FLAG_BE, "manual break-even", r);
         Dispatch(r);
      }
      m_state.Flush();
   }

   // SL/TP typed on the panel. Unlike automation, this may widen or remove a level;
   // it is still checked against the broker's stop and freeze rules.
   void ManualSetLevels(const ulong ticket, const double sl, const double tp)
   {
      string why;
      if(!m_guard.CanAct(why))
      {
         Logger.Warn("Manual", "levels not sent: " + why);
         return;
      }
      CRequestBuilder builder;
      SExecRequest r;
      builder.ModifyLevels(ticket, sl, tp, "manual levels", r);
      SExecOutcome out;
      if(m_exec.Submit(r, out))
         m_protection.OnExecuted(out.req);
      else
         Logger.Warn("Manual", StringFormat("#%I64u SL/TP not applied: %s", ticket, out.message));
      m_state.Flush();
   }

   void ManualPartial(const double percent)
   {
      Logger.Info("Manual", StringFormat("close %.0f%% of every managed position", percent));
      CRequestBuilder builder;
      CPositionRegistry *reg = m_positions.Registry();
      for(int i = 0; i < reg.Count(); i++)
      {
         CManagedPosition *p = reg.At(i);
         SExecRequest r;
         builder.PartialClose(p.ticket, p.volume * percent / 100.0, -1, "manual partial", r);
         Dispatch(r);
      }
      m_state.Flush();
   }

   // Tick: break-even, trailing, partials, retries.
   void HandleTick()
   {
      RunCycle(false);
   }

   // Timer: resynchronize with the account, refresh risk, cover symbols that are not ticking.
   void HandleTimer()
   {
      m_positions.Synchronize();
      m_risk.Refresh(true);
      RunCycle(true);
      m_state.Purge();
   }

   // Trade events keep the registry in step with MT5 without waiting for the timer.
   void HandleTradeTransaction(const MqlTradeTransaction &trans)
   {
      switch(trans.type)
      {
         case TRADE_TRANSACTION_DEAL_ADD:
            m_positions.Synchronize();
            m_risk.Refresh(true);
            EvaluateGuard();
            m_state.Flush();
            break;
         case TRADE_TRANSACTION_POSITION:
            m_positions.Synchronize();
            m_state.Flush();
            break;
         default:
            break;
      }
   }
};

#endif

#ifndef TM_CHARTPANEL_MQH
#define TM_CHARTPANEL_MQH



#ifndef TM_SESSIONCLOCK_MQH
#define TM_SESSIONCLOCK_MQH

#define TM_SESSIONS 4

// Forex market sessions in UTC hours. Start > end means the session wraps past midnight.
// Daylight saving is not automatic: adjust the hours in the inputs when clocks change.
class CSessionClock
{
private:
   string m_short[TM_SESSIONS];
   int    m_start[TM_SESSIONS];
   int    m_end[TM_SESSIONS];
   bool   m_open[TM_SESSIONS];
   string m_text[TM_SESSIONS];
   bool   m_weekend;
   string m_clock;

   string Span(const int minutes) const
   {
      if(minutes >= 24 * 60)
         return StringFormat("%dd%02dh", minutes / (24 * 60), (minutes % (24 * 60)) / 60);
      return StringFormat("%dh%02dm", minutes / 60, minutes % 60);
   }

public:
   CSessionClock()
   {
      m_short[0] = "SYD"; m_short[1] = "TKY"; m_short[2] = "LON"; m_short[3] = "NYC";
      Configure(22, 7, 0, 9, 8, 17, 13, 22);
      m_weekend = false;
      m_clock = "";
      for(int i = 0; i < TM_SESSIONS; i++) { m_open[i] = false; m_text[i] = ""; }
   }

   void Configure(const int sydS, const int sydE, const int tkyS, const int tkyE,
                  const int lonS, const int lonE, const int nycS, const int nycE)
   {
      m_start[0] = sydS; m_end[0] = sydE;
      m_start[1] = tkyS; m_end[1] = tkyE;
      m_start[2] = lonS; m_end[2] = lonE;
      m_start[3] = nycS; m_end[3] = nycE;
   }

   void Update()
   {
      const datetime gmt = TimeGMT();
      MqlDateTime dt;
      TimeToStruct(gmt, dt);
      const int now = dt.hour * 60 + dt.min;

      // Forex is closed from Friday 22:00 UTC to Sunday 22:00 UTC.
      m_weekend = (dt.day_of_week == 6) ||
                  (dt.day_of_week == 5 && now >= 22 * 60) ||
                  (dt.day_of_week == 0 && now < 22 * 60);

      // Minutes until the market reopens on Sunday 22:00 UTC (0 when it is open).
      int untilReopen = 0;
      if(m_weekend)
      {
         const int reopen = 22 * 60;
         if(dt.day_of_week == 0)      untilReopen = reopen - now;
         else if(dt.day_of_week == 6) untilReopen = (24 * 60 - now) + reopen;
         else                         untilReopen = (24 * 60 - now) + 24 * 60 + reopen;   // Friday evening
      }

      for(int i = 0; i < TM_SESSIONS; i++)
      {
         const int s = m_start[i] * 60;
         const int e = m_end[i] * 60;
         const bool wraps = (e <= s);
         m_open[i] = !m_weekend && (wraps ? (now >= s || now < e) : (now >= s && now < e));

         if(m_weekend)
         {
            // The first start of this session at or after the reopen.
            const int firstStart = untilReopen + ((s - 22 * 60 + 24 * 60) % (24 * 60));
            m_text[i] = m_short[i] + " off +" + Span(firstStart);
         }
         else if(m_open[i])
            m_text[i] = m_short[i] + " ON  " + Span((e - now + 1440) % 1440);
         else
            m_text[i] = m_short[i] + " off +" + Span((s - now + 1440) % 1440);
      }

      MqlDateTime sv;
      TimeToStruct(TimeCurrent(), sv);
      m_clock = StringFormat("UTC %02d:%02d   Server %02d:%02d%s", dt.hour, dt.min, sv.hour, sv.min,
                             m_weekend ? "   CLOSED, opens in " + Span(untilReopen) : "");
   }

   bool   Weekend() const { return m_weekend; }
   string Clock() const { return m_clock; }
   string Text(const int i) const { return m_text[i]; }
   bool   IsOpen(const int i) const { return m_open[i]; }
};

#endif


#define TM_PANEL_PREFIX "TMP_"
#define TM_PANEL_ROWS   6
#define TM_PANEL_W      440
#define TM_PANEL_H      440
#define TM_PANEL_H_MIN  30
#define TM_PANEL_PRICE_H 106         // big price, open P/L and candle timer under the title bar
#define TM_PANEL_TITLE_H 28
#define TM_PANEL_ROW_Y  282
#define TM_PANEL_ACT_Y  410
#define TM_PANEL_ROW_H  20

enum ENUM_PANEL_ACTION
{
   PANEL_NONE = 0,
   PANEL_TOGGLE_BE,
   PANEL_TOGGLE_TRAIL,
   PANEL_TOGGLE_PARTIAL,
   PANEL_TOGGLE_PAUSE,
   PANEL_BE_ALL,
   PANEL_CLOSE_HALF,
   PANEL_CLOSE_ALL,
   PANEL_ORDER,          // a BUY/SELL/pending button; read the fields with TakeOrder()
   PANEL_SET_LEVELS      // Enter pressed in a SL/TP field; read the row with TakeLevels()
};

// Drawing and click handling only. It knows nothing about trading: the engine feeds it
// numbers with SetRow()/Render() and reacts to the action HandleEvent() returns.
class CChartPanel
{
private:
   int    m_x;
   int    m_y;
   bool   m_created;
   bool   m_minimized;
   int    m_pendingRow;
   ENUM_ORDER_TYPE m_orderType;
   string m_all[];                     // every object, so a drag can move them together
   bool   m_dragging;
   int    m_dragDX;
   int    m_dragDY;
   bool   m_scrollLocked;
   bool   m_scrollWas;
   int    m_dy;                        // vertical offset of everything below the price strip
   int    m_priceFont;
   double m_lastBid;
   double m_lastAsk;
   color  m_bidColor;
   color  m_askColor;
   ulong  m_lastRedraw;
   bool   m_editing;                   // a LOT / PRICE / SL / TP entry field has focus
   string m_content[];                 // hidden when the panel is minimized

   string m_rowText[TM_PANEL_ROWS];
   color  m_rowColor[TM_PANEL_ROWS];
   ulong  m_rowTicket[TM_PANEL_ROWS];  // 0 = row unused
   double m_rowSL[TM_PANEL_ROWS];
   double m_rowTP[TM_PANEL_ROWS];
   int    m_rowDigits[TM_PANEL_ROWS];
   bool   m_rowDirty[TM_PANEL_ROWS];   // the user has typed in this row's fields

   string Name(const string id) const { return TM_PANEL_PREFIX + id; }
   string RowId(const string kind, const int i) const { return kind + IntegerToString(i); }

   void Track(const string id)
   {
      const int k = ArraySize(m_content);
      ArrayResize(m_content, k + 1);
      m_content[k] = Name(id);
   }

   void Base(const string id, const ENUM_OBJECT type)
   {
      const string n = Name(id);
      const int k = ArraySize(m_all);
      ArrayResize(m_all, k + 1);
      m_all[k] = n;
      ObjectCreate(0, n, type, 0, 0, 0);
      ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
   }

   void Rect(const string id, const int x, const int y, const int w, const int h,
             const color bg, const color border)
   {
      Base(id, OBJ_RECTANGLE_LABEL);
      const string n = Name(id);
      ObjectSetInteger(0, n, OBJPROP_XDISTANCE, m_x + x);
      ObjectSetInteger(0, n, OBJPROP_YDISTANCE, m_y + m_dy + y);
      ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
      ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
      ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
      ObjectSetInteger(0, n, OBJPROP_BORDER_TYPE, BORDER_FLAT);
      ObjectSetInteger(0, n, OBJPROP_COLOR, border);
   }

   void Label(const string id, const int x, const int y, const string text,
              const color clr, const int size)
   {
      Base(id, OBJ_LABEL);
      const string n = Name(id);
      ObjectSetInteger(0, n, OBJPROP_XDISTANCE, m_x + x);
      ObjectSetInteger(0, n, OBJPROP_YDISTANCE, m_y + m_dy + y);
      ObjectSetInteger(0, n, OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
      ObjectSetInteger(0, n, OBJPROP_COLOR, clr);
      ObjectSetInteger(0, n, OBJPROP_FONTSIZE, size);
      ObjectSetString(0, n, OBJPROP_FONT, "Consolas");
      ObjectSetString(0, n, OBJPROP_TEXT, text);
   }

   void Button(const string id, const int x, const int y, const int w, const int h, const string text)
   {
      Base(id, OBJ_BUTTON);
      const string n = Name(id);
      ObjectSetInteger(0, n, OBJPROP_XDISTANCE, m_x + x);
      ObjectSetInteger(0, n, OBJPROP_YDISTANCE, m_y + m_dy + y);
      ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
      ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
      ObjectSetInteger(0, n, OBJPROP_FONTSIZE, 8);
      ObjectSetString(0, n, OBJPROP_FONT, "Arial");
      ObjectSetString(0, n, OBJPROP_TEXT, text);
      ObjectSetInteger(0, n, OBJPROP_BORDER_COLOR, C'90,90,90');
      ObjectSetInteger(0, n, OBJPROP_STATE, false);
   }

   void Edit(const string id, const int x, const int y, const int w, const int h)
   {
      Base(id, OBJ_EDIT);
      const string n = Name(id);
      ObjectSetInteger(0, n, OBJPROP_XDISTANCE, m_x + x);
      ObjectSetInteger(0, n, OBJPROP_YDISTANCE, m_y + m_dy + y);
      ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
      ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
      ObjectSetInteger(0, n, OBJPROP_FONTSIZE, 8);
      ObjectSetString(0, n, OBJPROP_FONT, "Consolas");
      ObjectSetInteger(0, n, OBJPROP_ALIGN, ALIGN_RIGHT);
      ObjectSetInteger(0, n, OBJPROP_READONLY, false);
      ObjectSetInteger(0, n, OBJPROP_COLOR, clrWhite);
      ObjectSetInteger(0, n, OBJPROP_BGCOLOR, C'38,42,52');
      ObjectSetInteger(0, n, OBJPROP_BORDER_COLOR, C'90,90,90');
      ObjectSetString(0, n, OBJPROP_TEXT, "0");
   }

   void SetText(const string id, const string text, const color clr)
   {
      ObjectSetString(0, Name(id), OBJPROP_TEXT, text);
      ObjectSetInteger(0, Name(id), OBJPROP_COLOR, clr);
   }

   void SetButton(const string id, const string text, const color bg)
   {
      ObjectSetString(0, Name(id), OBJPROP_TEXT, text);
      ObjectSetInteger(0, Name(id), OBJPROP_BGCOLOR, bg);
      ObjectSetInteger(0, Name(id), OBJPROP_COLOR, clrWhite);
   }

   // Writes a field only when it differs, so a field being edited is not disturbed.
   void SetEditText(const string id, const string text, const color bg)
   {
      if(ObjectGetString(0, Name(id), OBJPROP_TEXT) != text)
         ObjectSetString(0, Name(id), OBJPROP_TEXT, text);
      ObjectSetInteger(0, Name(id), OBJPROP_BGCOLOR, bg);
   }

   void Show(const string name, const bool visible)
   {
      ObjectSetInteger(0, name, OBJPROP_TIMEFRAMES, visible ? OBJ_ALL_PERIODS : OBJ_NO_PERIODS);
   }

   void ApplyVisibility()
   {
      for(int i = 0; i < ArraySize(m_content); i++)
         Show(m_content[i], !m_minimized);
      for(int i = 0; i < TM_PANEL_ROWS; i++)
      {
         const bool vis = !m_minimized && m_rowTicket[i] != 0;
         Show(Name(RowId("row", i)), vis);
         Show(Name(RowId("sl", i)), vis);
         Show(Name(RowId("tp", i)), vis);
      }
   }

   void Layout()
   {
      ObjectSetInteger(0, Name("bg"), OBJPROP_YSIZE, (m_minimized ? TM_PANEL_H_MIN : TM_PANEL_H) + TM_PANEL_PRICE_H);
      ObjectSetString(0, Name("min"), OBJPROP_TEXT, m_minimized ? "+" : "_");
      ApplyVisibility();
   }

   // Digits, at most one dot, or empty (= 0, "no level").
   bool ParsePrice(string text, double &value) const
   {
      StringReplace(text, ",", ".");
      StringTrimLeft(text);
      StringTrimRight(text);
      if(text == "")
      {
         value = 0.0;
         return true;
      }
      int dots = 0;
      for(int i = 0; i < StringLen(text); i++)
      {
         const ushort c = StringGetCharacter(text, i);
         if(c == '.')
            dots++;
         else if(c < '0' || c > '9')
            return false;
      }
      if(dots > 1)
         return false;
      value = StringToDouble(text);
      return true;
   }

   void LockScroll()
   {
      if(m_scrollLocked)
         return;
      m_scrollWas = (ChartGetInteger(0, CHART_MOUSE_SCROLL) != 0);
      ChartSetInteger(0, CHART_MOUSE_SCROLL, false);
      m_scrollLocked = true;
   }

   void UnlockScroll()
   {
      if(!m_scrollLocked)
         return;
      ChartSetInteger(0, CHART_MOUSE_SCROLL, m_scrollWas);
      m_scrollLocked = false;
   }

   void MoveTo(int nx, int ny)
   {
      const int cw = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS);
      const int ch = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS);
      nx = MathMax(0, MathMin(nx, cw - 80));
      ny = MathMax(0, MathMin(ny, ch - TM_PANEL_H_MIN));
      const int dx = nx - m_x;
      const int dy = ny - m_y;
      if(dx == 0 && dy == 0)
         return;
      for(int i = 0; i < ArraySize(m_all); i++)
      {
         ObjectSetInteger(0, m_all[i], OBJPROP_XDISTANCE, ObjectGetInteger(0, m_all[i], OBJPROP_XDISTANCE) + dx);
         ObjectSetInteger(0, m_all[i], OBJPROP_YDISTANCE, ObjectGetInteger(0, m_all[i], OBJPROP_YDISTANCE) + dy);
      }
      m_x = nx;
      m_y = ny;
      ChartRedraw();
   }

public:
   CChartPanel()
   {
      m_x = 10; m_y = 20; m_created = false; m_minimized = false;
      m_pendingRow = -1;
      m_orderType = ORDER_TYPE_BUY;
      m_dragging = false; m_dragDX = 0; m_dragDY = 0; m_scrollLocked = false; m_scrollWas = true; m_editing = false;
      m_dy = 0; m_priceFont = 24; m_lastBid = 0.0; m_lastAsk = 0.0;
      m_bidColor = clrWhite; m_askColor = clrWhite; m_lastRedraw = 0;
      for(int i = 0; i < TM_PANEL_ROWS; i++)
      {
         m_rowText[i] = ""; m_rowColor[i] = clrSilver; m_rowTicket[i] = 0;
         m_rowSL[i] = 0.0; m_rowTP[i] = 0.0; m_rowDigits[i] = 5; m_rowDirty[i] = false;
      }
   }

   bool Create(const int x, const int y, const double defaultLot)
   {
      Destroy();
      m_x = x;
      m_y = y;
      ArrayResize(m_content, 0);
      ArrayResize(m_all, 0);

      // Keep the panel on screen even if the chart is smaller than when it was placed.
      const int cw = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS);
      const int ch = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS);
      if(cw > 0) m_x = MathMax(0, MathMin(m_x, cw - 80));
      if(ch > 0) m_y = MathMax(0, MathMin(m_y, ch - TM_PANEL_H_MIN));
      m_x = MathMax(0, m_x);
      m_y = MathMax(0, m_y);

      ChartSetInteger(0, CHART_EVENT_MOUSE_MOVE, true);

      m_dy = 0;
      Rect("bg", 0, 0, TM_PANEL_W, TM_PANEL_H + TM_PANEL_PRICE_H, C'24,26,32', C'70,74,84');
      Rect("bar", 0, 0, TM_PANEL_W, TM_PANEL_TITLE_H, C'40,44,54', C'70,74,84');
      Label("title", 8, 7, "TRADE MANAGER  v2.2   (drag this bar to move)", clrWhite, 9);
      Button("min", TM_PANEL_W - 30, 4, 22, 20, "_");
      SetButton("min", "_", C'55,58,66');

      // Big live price. Not tracked, so it stays visible when the panel is minimized.
      Label("pcap1", 8,   32, "", C'150,155,165', 9);
      Label("pcap2", 224, 32, "", C'150,155,165', 9);
      Label("pbid",  8,   46, "", clrWhite, m_priceFont);
      Label("pask",  224, 46, "", clrWhite, m_priceFont);
      Label("pfloat", 8,  84, "", clrSilver, 16);
      Label("pcandle", 8, 110, "", C'200,205,215', 14);
      m_dy = TM_PANEL_PRICE_H;

      Label("l1", 8, 32, "", clrSilver, 9);   Track("l1");
      Label("l2", 8, 48, "", clrSilver, 9);   Track("l2");
      Label("l3", 8, 64, "", clrSilver, 9);   Track("l3");
      Label("clock", 8, 82, "", clrSilver, 8);   Track("clock");
      for(int i = 0; i < TM_SESSIONS; i++)
      {
         Label(RowId("sess", i), 8 + i * 108, 98, "", clrGray, 8);
         Track(RowId("sess", i));
      }

      const int tw = 137;
      Button("be",      8,            124, tw, 22, "");  Track("be");
      Button("trail",   8 + tw + 6,   124, tw, 22, "");  Track("trail");
      Button("partial", 8 + 2*(tw+6), 124, tw, 22, "");  Track("partial");

      const int aw = 101;
      Button("pause",    8,            TM_PANEL_ACT_Y, aw, 22, "");  Track("pause");
      Button("beall",    8 + aw + 6,   TM_PANEL_ACT_Y, aw, 22, "");  Track("beall");
      Button("half",     8 + 2*(aw+6), TM_PANEL_ACT_Y, aw, 22, "");  Track("half");
      Button("closeall", 8 + 3*(aw+6), TM_PANEL_ACT_Y, aw, 22, "");  Track("closeall");

      // ---- order entry
      Label("c_lot", 8,   154, "LOT", C'150,155,165', 8);             Track("c_lot");
      Label("c_px",  74,  154, "PRICE (pending)", C'150,155,165', 8); Track("c_px");
      Label("c_sl",  198, 154, "SL", C'150,155,165', 8);              Track("c_sl");
      Label("c_tp",  316, 154, "TP", C'150,155,165', 8);              Track("c_tp");
      Edit("olot", 8,   168, 60,  20);  Track("olot");
      Edit("opx",  74,  168, 118, 20);  Track("opx");
      Edit("osl",  198, 168, 112, 20);  Track("osl");
      Edit("otp",  316, 168, 112, 20);  Track("otp");
      ObjectSetString(0, Name("olot"), OBJPROP_TEXT, DoubleToString(defaultLot, 2));
      ObjectSetString(0, Name("opx"), OBJPROP_TEXT, "");
      ObjectSetString(0, Name("osl"), OBJPROP_TEXT, "");
      ObjectSetString(0, Name("otp"), OBJPROP_TEXT, "");

      Button("buy",  8,   194, 209, 24, "BUY MARKET");   Track("buy");
      Button("sell", 223, 194, 205, 24, "SELL MARKET");  Track("sell");
      SetButton("buy",  "BUY MARKET",  C'28,130,70');
      SetButton("sell", "SELL MARKET", C'185,55,55');

      Button("buylimit",  8,   222, 101, 22, "BUY LIMIT");   Track("buylimit");
      Button("buystop",   115, 222, 101, 22, "BUY STOP");    Track("buystop");
      Button("selllimit", 222, 222, 101, 22, "SELL LIMIT");  Track("selllimit");
      Button("sellstop",  329, 222, 99,  22, "SELL STOP");   Track("sellstop");
      SetButton("buylimit",  "BUY LIMIT",  C'30,95,62');
      SetButton("buystop",   "BUY STOP",   C'30,95,62');
      SetButton("selllimit", "SELL LIMIT", C'130,48,48');
      SetButton("sellstop",  "SELL STOP",  C'130,48,48');

      Label("ostat", 8, 250, "", clrSilver, 8);  Track("ostat");

      Label("hdr",  8,   264, "POSITION", C'150,155,165', 8);   Track("hdr");
      Label("hsl", 222,  264, "SL", C'150,155,165', 8);   Track("hsl");
      Label("htp", 328,  264, "TP   (Enter = apply, 0 = none)", C'150,155,165', 8);   Track("htp");

      for(int i = 0; i < TM_PANEL_ROWS; i++)
      {
         const int y = TM_PANEL_ROW_Y + i * TM_PANEL_ROW_H;
         Label(RowId("row", i), 8, y + 3, "", clrSilver, 8);
         Edit(RowId("sl", i), 222, y, 100, 18);
         Edit(RowId("tp", i), 328, y, 100, 18);
      }

      m_created = true;
      Layout();
      return true;
   }

   void Destroy()
   {
      UnlockScroll();
      ObjectsDeleteAll(0, TM_PANEL_PREFIX);
      ArrayResize(m_content, 0);
      ArrayResize(m_all, 0);
      m_dragging = false;
      m_created = false;
   }

   // MT5 draws objects in creation order, so arrows the terminal adds when a trade opens or
   // closes land on top of an older panel. Rebuilding the panel makes it the newest object again.
   // Typed text and the status line are carried over. Returns false if now is a bad moment
   // (dragging, or the user is typing) so the caller can try again later.
   bool Raise(const double defaultLot)
   {
      if(!m_created || m_dragging || m_editing)
         return false;
      for(int i = 0; i < TM_PANEL_ROWS; i++)
         if(m_rowDirty[i])
            return false;

      const string lot    = ObjectGetString(0, Name("olot"), OBJPROP_TEXT);
      const string px     = ObjectGetString(0, Name("opx"),  OBJPROP_TEXT);
      const string sl     = ObjectGetString(0, Name("osl"),  OBJPROP_TEXT);
      const string tp     = ObjectGetString(0, Name("otp"),  OBJPROP_TEXT);
      const string status = ObjectGetString(0, Name("ostat"), OBJPROP_TEXT);
      const color  statusColor = (color)ObjectGetInteger(0, Name("ostat"), OBJPROP_COLOR);

      Create(m_x, m_y, defaultLot);

      ObjectSetString(0, Name("olot"), OBJPROP_TEXT, lot);
      ObjectSetString(0, Name("opx"),  OBJPROP_TEXT, px);
      ObjectSetString(0, Name("osl"),  OBJPROP_TEXT, sl);
      ObjectSetString(0, Name("otp"),  OBJPROP_TEXT, tp);
      SetText("ostat", status, statusColor);
      return true;
   }

   int X() const { return m_x; }
   int Y() const { return m_y; }

   void SetStatus(const string text, const color clr)
   {
      if(!m_created)
         return;
      SetText("ostat", text, clr);
      ChartRedraw();
   }

   // After PANEL_ORDER: the order type of the pressed button and the typed fields.
   // False if a field is not a plain number or the lot is not positive.
   bool TakeOrder(ENUM_ORDER_TYPE &type, double &lot, double &price, double &sl, double &tp)
   {
      double l = 0.0, p = 0.0, s = 0.0, t = 0.0;
      if(!ParsePrice(ObjectGetString(0, Name("olot"), OBJPROP_TEXT), l) ||
         !ParsePrice(ObjectGetString(0, Name("opx"),  OBJPROP_TEXT), p) ||
         !ParsePrice(ObjectGetString(0, Name("osl"),  OBJPROP_TEXT), s) ||
         !ParsePrice(ObjectGetString(0, Name("otp"),  OBJPROP_TEXT), t) || l <= 0.0)
         return false;
      type = m_orderType;
      lot = l; price = p; sl = s; tp = t;
      return true;
   }

   void SetPriceFont(const int size) { m_priceFont = MathMax(10, MathMin(size, 28)); }

   // Bid and Ask in large type: green after an uptick, red after a downtick.
   void SetPrice(const string symbol, const double bid, const double ask, const int digits, const int spreadPoints)
   {
      if(!m_created)
         return;
      const color up = C'110,210,130';
      const color dn = C'235,110,110';
      if(bid > m_lastBid)      m_bidColor = up;
      else if(bid < m_lastBid) m_bidColor = dn;
      if(ask > m_lastAsk)      m_askColor = up;
      else if(ask < m_lastAsk) m_askColor = dn;
      const bool changed = (bid != m_lastBid || ask != m_lastAsk);
      m_lastBid = bid;
      m_lastAsk = ask;

      SetText("pcap1", symbol + "   BID", C'150,155,165');
      SetText("pcap2", StringFormat("ASK   spread %d", spreadPoints), C'150,155,165');
      SetText("pbid", DoubleToString(bid, digits), m_bidColor);
      SetText("pask", DoubleToString(ask, digits), m_askColor);

      const ulong now = TM_NowMs();
      if(changed && now - m_lastRedraw >= 100)
      {
         m_lastRedraw = now;
         ChartRedraw();
      }
   }

   // Total floating profit of the account right now (not the day total). Large, green / red.
   void SetFloating(const double money, const double pctOfBalance, const string currency)
   {
      if(!m_created)
         return;
      const color clr = money > 0.0 ? C'110,210,130' : (money < 0.0 ? C'235,110,110' : C'170,175,185');
      SetText("pfloat", StringFormat("OPEN P/L  %+.2f %s  (%+.2f%%)", money, currency, pctOfBalance), clr);
   }

   void SetCandle(const string text, const color clr)
   {
      if(m_created)
         SetText("pcandle", text, clr);
   }

   void SetClock(const string text, const color clr)
   {
      if(m_created)
         SetText("clock", text, clr);
   }

   void SetSession(const int index, const string text, const color clr)
   {
      if(m_created && index >= 0 && index < TM_SESSIONS)
         SetText(RowId("sess", index), text, clr);
   }

   // Moving is done by dragging the title bar; the chart must not scroll meanwhile.
   // Returns 0 = nothing, 1 = dragging, 2 = the panel was just dropped (save its position).
   int HandleMouse(const int id, const long &lparam, const double &dparam, const string &sparam)
   {
      if(!m_created || id != CHARTEVENT_MOUSE_MOVE)
         return 0;

      const int mx = (int)lparam;
      const int my = (int)dparam;
      const bool down = (((uint)StringToInteger(sparam)) & 1) != 0;
      const bool onBar = (mx >= m_x && mx < m_x + TM_PANEL_W - 36 && my >= m_y && my < m_y + TM_PANEL_TITLE_H);

      if(onBar || m_dragging)
         LockScroll();
      else
         UnlockScroll();

      if(down && !m_dragging && onBar)
      {
         m_dragging = true;
         m_dragDX = mx - m_x;
         m_dragDY = my - m_y;
      }
      if(down && m_dragging)
      {
         MoveTo(mx - m_dragDX, my - m_dragDY);
         return 1;
      }
      if(!down && m_dragging)
      {
         m_dragging = false;
         if(!onBar)
            UnlockScroll();
         return 2;
      }
      return 0;
   }

   // ticket 0 clears the row.
   void SetRow(const int index, const ulong ticket, const string text, const color clr,
               const double sl, const double tp, const int digits)
   {
      if(index < 0 || index >= TM_PANEL_ROWS)
         return;
      if(m_rowTicket[index] != ticket)
         m_rowDirty[index] = false;          // another position moved into this row
      m_rowTicket[index] = ticket;
      m_rowText[index]   = text;
      m_rowColor[index]  = clr;
      m_rowSL[index]     = sl;
      m_rowTP[index]     = tp;
      m_rowDigits[index] = digits;
   }

   void Render(const int positions, const double openRisk, const double openRiskPct,
               const double balance, const double dailyPL, const double dailyPLPct, const double ddPct,
               const string protection, const bool protectionActive,
               const bool beOn, const bool trailOn, const bool partialOn, const bool paused)
   {
      if(!m_created)
         return;

      const color on  = C'28,120,64';
      const color off = C'70,72,80';

      SetText("l1", StringFormat("Positions %d   Open risk %.2f (%.2f%%)", positions, openRisk, openRiskPct), clrSilver);
      SetText("l2", StringFormat("Bal %.2f | Daily P/L %.2f (%.2f%%) | DD %.2f%%", balance, dailyPL, dailyPLPct, ddPct),
              dailyPL >= 0.0 ? C'110,210,130' : C'235,110,110');
      SetText("l3", "Protection: " + protection + (paused ? "   [PAUSED]" : ""),
              protectionActive ? C'235,110,110' : (paused ? C'240,190,80' : C'110,210,130'));

      SetButton("be",      beOn      ? "BE: ON"      : "BE: OFF",      beOn      ? on : off);
      SetButton("trail",   trailOn   ? "TRAIL: ON"   : "TRAIL: OFF",   trailOn   ? on : off);
      SetButton("partial", partialOn ? "PARTIAL: ON" : "PARTIAL: OFF", partialOn ? on : off);

      SetButton("pause",    paused ? "RESUME" : "PAUSE", paused ? C'170,120,20' : C'55,58,66');
      SetButton("beall",    "BE ALL", C'40,80,140');
      SetButton("half",     "CLOSE 50%", C'110,70,40');
      SetButton("closeall", "CLOSE ALL", C'150,45,45');

      for(int i = 0; i < TM_PANEL_ROWS; i++)
      {
         SetText(RowId("row", i), m_rowText[i], m_rowColor[i]);
         if(m_rowTicket[i] == 0)
            continue;
         if(m_rowDirty[i])
         {
            // Typed but not applied yet: keep the user's text, tint the fields.
            SetEditText(RowId("sl", i), ObjectGetString(0, Name(RowId("sl", i)), OBJPROP_TEXT), C'80,64,20');
            SetEditText(RowId("tp", i), ObjectGetString(0, Name(RowId("tp", i)), OBJPROP_TEXT), C'80,64,20');
         }
         else
         {
            SetEditText(RowId("sl", i), DoubleToString(m_rowSL[i], m_rowDigits[i]), C'38,42,52');
            SetEditText(RowId("tp", i), DoubleToString(m_rowTP[i], m_rowDigits[i]), C'38,42,52');
         }
      }
      ApplyVisibility();
      ChartRedraw();
   }

   // Call from OnChartEvent. Returns the action the engine should perform, if any.
   ENUM_PANEL_ACTION HandleEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
   {
      if(!m_created || StringFind(sparam, TM_PANEL_PREFIX) != 0)
         return PANEL_NONE;
      const string key = StringSubstr(sparam, StringLen(TM_PANEL_PREFIX));

      if(key == "olot" || key == "opx" || key == "osl" || key == "otp")
      {
         if(id == CHARTEVENT_OBJECT_CLICK)
            m_editing = true;
         else if(id == CHARTEVENT_OBJECT_ENDEDIT)
            m_editing = false;
         return PANEL_NONE;
      }

      const string kind = StringSubstr(key, 0, 2);
      const bool isField = (kind == "sl" || kind == "tp");
      const int fieldRow = isField ? (int)StringToInteger(StringSubstr(key, 2)) : -1;

      if(isField && fieldRow >= 0 && fieldRow < TM_PANEL_ROWS)
      {
         // Clicking into a field starts an edit: stop refreshing this row so typing is not overwritten.
         if(id == CHARTEVENT_OBJECT_CLICK)
            m_rowDirty[fieldRow] = true;
         // Enter (or leaving the field) ends the edit: apply it.
         if(id == CHARTEVENT_OBJECT_ENDEDIT && m_rowTicket[fieldRow] != 0)
         {
            m_rowDirty[fieldRow] = true;
            m_pendingRow = fieldRow;
            return PANEL_SET_LEVELS;
         }
         return PANEL_NONE;
      }

      if(id != CHARTEVENT_OBJECT_CLICK)
         return PANEL_NONE;

      ObjectSetInteger(0, sparam, OBJPROP_STATE, false);   // buttons never stay pressed

      if(key == "min")
      {
         m_minimized = !m_minimized;
         Layout();
         ChartRedraw();
         return PANEL_NONE;
      }
      if(key == "be")       return PANEL_TOGGLE_BE;
      if(key == "trail")    return PANEL_TOGGLE_TRAIL;
      if(key == "partial")  return PANEL_TOGGLE_PARTIAL;
      if(key == "pause")    return PANEL_TOGGLE_PAUSE;
      if(key == "beall")    return PANEL_BE_ALL;
      if(key == "half")     return PANEL_CLOSE_HALF;
      if(key == "closeall") return PANEL_CLOSE_ALL;

      if(key == "buy")       { m_orderType = ORDER_TYPE_BUY;        return PANEL_ORDER; }
      if(key == "sell")      { m_orderType = ORDER_TYPE_SELL;       return PANEL_ORDER; }
      if(key == "buylimit")  { m_orderType = ORDER_TYPE_BUY_LIMIT;  return PANEL_ORDER; }
      if(key == "buystop")   { m_orderType = ORDER_TYPE_BUY_STOP;   return PANEL_ORDER; }
      if(key == "selllimit") { m_orderType = ORDER_TYPE_SELL_LIMIT; return PANEL_ORDER; }
      if(key == "sellstop")  { m_orderType = ORDER_TYPE_SELL_STOP;  return PANEL_ORDER; }
      return PANEL_NONE;
   }

   // After PANEL_SET_LEVELS: the ticket and the SL/TP typed on that row.
   bool TakeLevels(ulong &ticket, double &sl, double &tp)
   {
      const int row = m_pendingRow;
      m_pendingRow = -1;
      if(row < 0 || row >= TM_PANEL_ROWS || m_rowTicket[row] == 0)
         return false;

      double s = 0.0, t = 0.0;
      if(!ParsePrice(ObjectGetString(0, Name(RowId("sl", row)), OBJPROP_TEXT), s) ||
         !ParsePrice(ObjectGetString(0, Name(RowId("tp", row)), OBJPROP_TEXT), t))
      {
         Logger.Warn("Panel", "SL/TP must be plain numbers (digits and one dot); nothing was sent");
         return false;
      }
      m_rowDirty[row] = false;              // live values take over again after the edit
      const double half = 0.5 * MathPow(10.0, -m_rowDigits[row]);
      if(MathAbs(s - m_rowSL[row]) < half && MathAbs(t - m_rowTP[row]) < half)
         return false;                      // entered and left the field without changing anything
      ticket = m_rowTicket[row];
      sl = s;
      tp = t;
      return true;
   }
};

#endif



// Owns and wires the modules. Holds no trading logic of its own.
class CEngine
{
private:
   CBrokerAdapter    m_broker;
   CStateStorage     m_storage;
   CRecoveryManager  m_recovery;
   CPositionEngine   m_positions;
   CProtectionEngine m_protection;
   CRiskEngine       m_risk;
   CRiskGuard        m_guard;
   CExecutionEngine  m_exec;
   CStateManager     m_state;
   CEventDispatcher  m_dispatch;
   CLifecycle        m_life;
   CChartPanel       m_panel;
   CSessionClock     m_sessions;
   ulong             m_raiseAt;         // when to rebuild the panel above new chart objects (0 = not pending)
   int               m_lastObjTotal;

   void Wire()
   {
      m_broker.Init((ulong)InpDeviationPoints);
      m_storage.Init(m_broker.Login());
      m_recovery.Attach(GetPointer(m_storage));

      m_positions.Attach(GetPointer(m_broker), GetPointer(m_recovery));
      m_positions.Configure(InpMagicFilter, InpChartSymbolOnly);

      CPositionRegistry *registry = m_positions.Registry();
      m_state.Attach(registry, GetPointer(m_recovery));
      m_protection.Attach(GetPointer(m_broker), registry);
      m_risk.Attach(GetPointer(m_broker), registry, GetPointer(m_storage));
      m_guard.Attach(GetPointer(m_broker));
      m_exec.Attach(GetPointer(m_broker));

      m_dispatch.Attach(GetPointer(m_positions), GetPointer(m_protection), GetPointer(m_risk),
                        GetPointer(m_guard), GetPointer(m_exec), GetPointer(m_state));
   }

   void Configure()
   {
      SStopLossConfig sl;
      sl.defaultSLPoints = InpDefaultSLPoints;

      SBreakEvenConfig be;
      be.enabled  = InpBEEnabled;
      be.triggerR = InpBETriggerR;
      be.offsetR  = InpBEOffsetR;

      STrailingConfig tr;
      tr.enabled          = InpTrailEnabled;
      tr.mode             = InpTrailMode;
      tr.activationPoints = InpTrailActivation;
      tr.distancePoints   = InpTrailDistance;
      tr.percent          = InpTrailPercent;
      tr.stepPoints       = InpTrailStep;

      SPartialConfig pc;
      pc.enabled = InpPartialEnabled;
      pc.levelR[0] = InpPartial1R;  pc.closePct[0] = InpPartial1Pct;
      pc.levelR[1] = InpPartial2R;  pc.closePct[1] = InpPartial2Pct;
      pc.levelR[2] = InpPartial3R;  pc.closePct[2] = InpPartial3Pct;

      m_protection.Configure(sl, be, tr, pc);

      SRiskLimits limits;
      limits.maxDailyLossPct = InpMaxDailyLossPct;
      limits.maxDrawdownPct  = InpMaxDrawdownPct;
      limits.minEquity       = InpMinEquity;
      limits.minMarginLevel  = InpMinMarginLevel;
      m_guard.Configure(limits);

      SExecutionConfig ex;
      ex.maxRetries   = InpMaxRetries;
      ex.retryDelayMs = InpRetryDelayMs;
      ex.laterDelayMs = InpRetryDelayMs * 10;
      ex.cooldownMs   = InpCooldownMs;
      ex.maxOrderLot  = InpMaxOrderLot;
      m_exec.Configure(ex);

      m_dispatch.Configure(InpMinProcessMs, InpCooldownMs, InpCloseAllOnTrip, InpBEOffsetR);

      m_dispatch.SetOrderMagic(InpMagicFilter >= 0 ? InpMagicFilter : 0);
      m_sessions.Configure(InpSydneyStart, InpSydneyEnd, InpTokyoStart, InpTokyoEnd,
                           InpLondonStart, InpLondonEnd, InpNewYorkStart, InpNewYorkEnd);
   }

   // Trade arrows are created by the terminal after the panel, so they draw over it.
   // A change in the chart object count, or a new deal, schedules a rebuild of the panel.
   void KeepPanelOnTop()
   {
      if(!InpShowPanel || !InpKeepPanelOnTop)
         return;
      const ulong now = TM_NowMs();
      const int total = ObjectsTotal(0);
      if(total != m_lastObjTotal)
      {
         m_lastObjTotal = total;
         if(m_raiseAt == 0)
            m_raiseAt = now + 800;
      }
      if(m_raiseAt != 0 && now >= m_raiseAt && m_panel.Raise(InpDefaultLot))
      {
         m_raiseAt = 0;
         m_lastObjTotal = ObjectsTotal(0);
         UpdatePanel();
      }
   }

   // Time left until the current candle of the chart's timeframe closes.
   void UpdateCandleTimer()
   {
      const datetime open = iTime(_Symbol, _Period, 0);
      if(open == 0)
         return;
      datetime close = open + PeriodSeconds(_Period);
      if(_Period == PERIOD_MN1)                    // months are not a fixed number of seconds
      {
         MqlDateTime d;
         TimeToStruct(open, d);
         d.mon++;
         if(d.mon > 12) { d.mon = 1; d.year++; }
         d.day = 1; d.hour = 0; d.min = 0; d.sec = 0;
         close = StructToTime(d);
      }
      const string tf = StringSubstr(EnumToString(_Period), 7);
      const long left = (long)close - (long)TimeTradeServer();
      if(left <= 0)
      {
         m_panel.SetCandle(tf + " candle  waiting for next bar", C'240,190,80');
         return;
      }
      const int h = (int)(left / 3600);
      const int m = (int)((left % 3600) / 60);
      const int s = (int)(left % 60);
      m_panel.SetCandle(StringFormat("%s candle  %s", tf, h > 0 ? StringFormat("%d:%02d:%02d", h, m, s)
                                                                : StringFormat("%02d:%02d", m, s)),
                        left <= 10 ? C'240,190,80' : C'200,205,215');
   }

   // Cheap enough to run on every tick: two labels, redraw throttled inside the panel.
   void UpdatePrice()
   {
      if(!InpShowPanel)
         return;
      MqlTick t;
      if(!SymbolInfoTick(_Symbol, t))
         return;
      const double floating = AccountInfoDouble(ACCOUNT_PROFIT);
      const double balance = AccountInfoDouble(ACCOUNT_BALANCE);
      m_panel.SetFloating(floating, balance > 0.0 ? floating / balance * 100.0 : 0.0,
                          AccountInfoString(ACCOUNT_CURRENCY));
      m_panel.SetPrice(_Symbol, t.bid, t.ask, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS),
                       (int)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD));
   }

   void UpdatePanel()
   {
      if(!InpShowPanel)
         return;

      UpdatePrice();
      UpdateCandleTimer();
      m_sessions.Update();
      m_panel.SetClock(m_sessions.Clock(), m_sessions.Weekend() ? C'240,190,80' : clrSilver);
      for(int s = 0; s < TM_SESSIONS; s++)
         m_panel.SetSession(s, m_sessions.Text(s), m_sessions.IsOpen(s) ? C'110,210,130' : clrGray);

      CPositionRegistry *reg = m_positions.Registry();
      const int n = reg.Count();
      const int slots = TM_PANEL_ROWS;

      for(int i = 0; i < slots; i++)
      {
         if(i >= n)
         {
            const string hint = (i == 0) ? StringFormat("No managed positions (account has %d open; check magic / symbol scope)",
                                                        m_broker.PositionCount()) : "";
            m_panel.SetRow(i, 0, hint, C'240,190,80', 0.0, 0.0, 5);
            continue;
         }
         CManagedPosition *p = reg.At(i);
         m_panel.SetRow(i, p.ticket,
                        StringFormat("#%I64u %s %s %.2f %.2f", p.ticket, p.symbol,
                                     p.IsBuy() ? "B" : "S", p.volume, p.profit),
                        p.profit >= 0.0 ? C'110,210,130' : C'235,110,110',
                        p.sl, p.tp, (int)SymbolInfoInteger(p.symbol, SYMBOL_DIGITS));
      }

      m_panel.Render(n, m_risk.exposure.openRiskMoney, m_risk.exposure.openRiskPct,
                     m_risk.account.balance, m_risk.account.dailyPL, m_risk.account.dailyPLPct, m_risk.drawdownPct,
                     TM_ProtectionText(m_guard.Status()), m_guard.IsProtectionActive(),
                     m_protection.BEEnabled(), m_protection.TrailingEnabled(), m_protection.PartialEnabled(),
                     m_dispatch.IsPaused());
   }

public:
   CEngine() { m_raiseAt = 0; m_lastObjTotal = 0; }

   int Initialize()
   {
      Logger.SetLevel(InpLogLevel);

      string why;
      if(!m_life.ValidateInputs(why))
      {
         Logger.Error("Engine", "invalid inputs: " + why);
         return INIT_PARAMETERS_INCORRECT;
      }
      if(!m_broker.IsTradeAllowed())
         Logger.Warn("Engine", "trading is not currently allowed; the manager will observe only until it is");

      Wire();
      Configure();

      if(!m_life.StartTimer(InpTimerMs))
      {
         Logger.Error("Engine", "could not start the timer");
         return INIT_FAILED;
      }

      m_positions.Synchronize();   // adopts open positions and recovers their state
      m_risk.Refresh(true);
      m_state.Flush();
      if(InpShowPanel)
      {
         m_panel.SetPriceFont(InpPriceFontSize);
         m_panel.Create((int)m_storage.LoadValue("PANEL_X", InpPanelX),
                        (int)m_storage.LoadValue("PANEL_Y", InpPanelY), InpDefaultLot);
      }
      m_lastObjTotal = ObjectsTotal(0);
      UpdatePanel();
      Logger.Info("Engine", StringFormat("started, managing %d position(s)", m_positions.Registry().Count()));
      return INIT_SUCCEEDED;
   }

   void OnTick()
   {
      m_dispatch.HandleTick();
      UpdatePrice();
   }

   void OnTimer()
   {
      m_dispatch.HandleTimer();
      UpdatePanel();
      KeepPanelOnTop();
   }

   void OnTradeTransaction(const MqlTradeTransaction &trans,
                           const MqlTradeRequest &request,
                           const MqlTradeResult &result)
   {
      m_dispatch.HandleTradeTransaction(trans);
      if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
         m_raiseAt = TM_NowMs() + 1500;      // the arrow appears a moment after the deal
   }

   void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
   {
      if(InpShowPanel && id == CHARTEVENT_MOUSE_MOVE)
      {
         if(m_panel.HandleMouse(id, lparam, dparam, sparam) == 2)
         {
            m_storage.SaveValue("PANEL_X", m_panel.X());
            m_storage.SaveValue("PANEL_Y", m_panel.Y());
         }
         return;
      }
      if(!InpShowPanel || (id != CHARTEVENT_OBJECT_CLICK && id != CHARTEVENT_OBJECT_ENDEDIT))
         return;

      switch(m_panel.HandleEvent(id, lparam, dparam, sparam))
      {
         case PANEL_TOGGLE_BE:
            m_protection.SetBEEnabled(!m_protection.BEEnabled());
            Logger.Info("Panel", StringFormat("break-even %s", m_protection.BEEnabled() ? "ON" : "OFF"));
            break;
         case PANEL_TOGGLE_TRAIL:
            m_protection.SetTrailingEnabled(!m_protection.TrailingEnabled());
            Logger.Info("Panel", StringFormat("trailing %s", m_protection.TrailingEnabled() ? "ON" : "OFF"));
            break;
         case PANEL_TOGGLE_PARTIAL:
            m_protection.SetPartialEnabled(!m_protection.PartialEnabled());
            Logger.Info("Panel", StringFormat("partial close %s", m_protection.PartialEnabled() ? "ON" : "OFF"));
            break;
         case PANEL_TOGGLE_PAUSE:
            m_dispatch.SetPaused(!m_dispatch.IsPaused());
            Logger.Info("Panel", m_dispatch.IsPaused() ? "automation paused" : "automation resumed");
            break;
         case PANEL_BE_ALL:
            m_dispatch.ManualBreakEven();
            break;
         case PANEL_CLOSE_HALF:
            m_dispatch.ManualPartial(50.0);
            break;
         case PANEL_CLOSE_ALL:
            m_dispatch.ManualCloseAll();
            break;
         case PANEL_ORDER:
         {
            ENUM_ORDER_TYPE type = ORDER_TYPE_BUY;
            double lot = 0.0, price = 0.0, sl = 0.0, tp = 0.0;
            if(m_panel.TakeOrder(type, lot, price, sl, tp))
            {
               string msg;
               const bool ok = m_dispatch.ManualOrder(type, lot, price, sl, tp, _Symbol, msg);
               m_panel.SetStatus(msg, ok ? C'110,210,130' : C'235,110,110');
            }
            else
               m_panel.SetStatus("Order fields must be plain numbers and the lot above 0", C'240,190,80');
            break;
         }
         case PANEL_SET_LEVELS:
         {
            ulong ticket = 0;
            double sl = 0.0, tp = 0.0;
            if(m_panel.TakeLevels(ticket, sl, tp))
               m_dispatch.ManualSetLevels(ticket, sl, tp);
            break;
         }
         default:
            break;
      }
      UpdatePanel();
   }

   void Shutdown(const int reason)
   {
      m_life.StopTimer();
      m_state.Flush();
      m_panel.Destroy();
      Logger.Info("Engine", StringFormat("stopped (reason %d)", reason));
   }
};

#endif


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
