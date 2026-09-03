//+------------------------------------------------------------------+
//|                                           CandleNBreakAlert.mq5  |
//|  Marks the Nth candle of a trading session and alerts when price |
//|  breaks its high or its low.                                     |
//|                                                                  |
//|  This expert never places, modifies or closes an order. It only  |
//|  draws the two levels and raises an alert.                       |
//|                                                                  |
//|  Install: copy to MQL5/Experts, compile (F7), drop on the chart. |
//+------------------------------------------------------------------+
#property copyright "github.com/ferya3/test"
#property version   "1.00"
#property description "Alerts BULLISH or BEARISH when price closes beyond the high"
#property description "or the low of the Nth candle after a session opens."
#property description "Alert only - this expert does not trade."

input group "Session"
input int    InpSessionHour   = 0;      // Session opens at hour (server time)
input int    InpSessionMinute = 0;      // Session opens at minute
input int    InpCandleNumber  = 11;     // Which candle of the session (1 = the opening one)

input group "Confirmation"
input int    InpConfirmBars   = 1;      // Closes beyond the level before alerting
input bool   InpUseFilters    = true;   // Require MA and ADX to agree
input int    InpMaPeriod      = 14;     // MA period
input ENUM_MA_METHOD InpMaMethod = MODE_SMA;  // MA method
input int    InpAdxPeriod     = 14;     // ADX period
input double InpAdxMinimum    = 20.0;   // Minimum ADX for a break to count

input group "Alerts"
input bool   InpPopupAlert    = true;   // Popup alert
input bool   InpPushAlert     = false;  // Push notification to phone
input bool   InpSoundAlert    = true;   // Play a sound
input string InpSoundFile     = "alert.wav";  // Sound file

input group "Chart"
input bool   InpDrawLevels    = true;   // Draw the candle's high and low
input color  InpHighColor     = clrLimeGreen;  // High line colour
input color  InpLowColor      = clrTomato;     // Low line colour
input bool   InpShowPanel     = true;   // Show the readout in the corner

#define OBJ_PREFIX "CandleN_"

int      g_ma_handle    = INVALID_HANDLE;
int      g_adx_handle   = INVALID_HANDLE;

datetime g_session_open = 0;      // opening bell the current reference belongs to
datetime g_ref_time     = 0;      // timestamp of candle #N
double   g_ref_open     = 0.0;
double   g_ref_high     = 0.0;
double   g_ref_low      = 0.0;
double   g_ref_close    = 0.0;
bool     g_have_ref     = false;

bool     g_alerted_up   = false;
bool     g_alerted_down = false;
int      g_signal       = 0;      // +1 broke up, -1 broke down, 0 still inside

datetime g_last_bar     = 0;
uint     g_last_panel   = 0;

//+------------------------------------------------------------------+
int OnInit()
  {
   if(InpCandleNumber < 1)
     {
      Print("InpCandleNumber must be 1 or greater");
      return(INIT_PARAMETERS_INCORRECT);
     }
   if(InpConfirmBars < 1)
     {
      Print("InpConfirmBars must be 1 or greater");
      return(INIT_PARAMETERS_INCORRECT);
     }
   if(InpSessionHour < 0 || InpSessionHour > 23 ||
      InpSessionMinute < 0 || InpSessionMinute > 59)
     {
      Print("Session open must be a valid time of day");
      return(INIT_PARAMETERS_INCORRECT);
     }

   if(InpUseFilters)
     {
      g_ma_handle  = iMA(_Symbol, PERIOD_CURRENT, InpMaPeriod, 0, InpMaMethod, PRICE_CLOSE);
      g_adx_handle = iADX(_Symbol, PERIOD_CURRENT, InpAdxPeriod);
      if(g_ma_handle == INVALID_HANDLE || g_adx_handle == INVALID_HANDLE)
        {
         Print("Could not create the MA/ADX handles: ", GetLastError());
         return(INIT_FAILED);
        }
     }

   g_last_bar = 0;   // force a full pass on the first tick
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   if(g_ma_handle  != INVALID_HANDLE) IndicatorRelease(g_ma_handle);
   if(g_adx_handle != INVALID_HANDLE) IndicatorRelease(g_adx_handle);
   ObjectsDeleteAll(0, OBJ_PREFIX);
   Comment("");
  }

//+------------------------------------------------------------------+
void OnTick()
  {
   datetime bar = iTime(_Symbol, PERIOD_CURRENT, 0);
   if(bar != g_last_bar)
     {
      g_last_bar = bar;
      LocateReferenceCandle();
      CheckForBreak();
     }
   UpdatePanel();
  }

//+------------------------------------------------------------------+
//| The opening bell on the calendar day that `when` falls on.        |
//+------------------------------------------------------------------+
datetime SessionOpenOn(const datetime when)
  {
   MqlDateTime dt;
   TimeToStruct(when, dt);
   dt.hour = InpSessionHour;
   dt.min  = InpSessionMinute;
   dt.sec  = 0;
   return(StructToTime(dt));
  }

//+------------------------------------------------------------------+
//| Shift of the first bar opening at or after `when`, or -1.         |
//+------------------------------------------------------------------+
int FirstBarAtOrAfter(const datetime when)
  {
   int shift = iBarShift(_Symbol, PERIOD_CURRENT, when, false);
   if(shift < 0)
      return(-1);
   // iBarShift lands on the bar that contains `when`; step forward if that
   // bar opened before it.
   while(shift > 0 && iTime(_Symbol, PERIOD_CURRENT, shift) < when)
      shift--;
   if(iTime(_Symbol, PERIOD_CURRENT, shift) < when)
      return(-1);
   return(shift);
  }

//+------------------------------------------------------------------+
//| Find candle #N of the most recent session that the history        |
//| actually covers, and remember its high and low.                   |
//+------------------------------------------------------------------+
void LocateReferenceCandle()
  {
   datetime now       = TimeCurrent();
   datetime tolerance = 2 * PeriodSeconds();

   // Walk back a few days so that a weekend or a holiday does not leave us
   // counting from whatever bar happens to be first in the history.
   for(int back = 0; back < 5; back++)
     {
      datetime bell = SessionOpenOn(now) - back * 86400;
      if(bell > now)
         continue;

      int first = FirstBarAtOrAfter(bell);
      if(first < 0)
         continue;
      if(iTime(_Symbol, PERIOD_CURRENT, first) - bell > tolerance)
         continue;   // the session's first bar is missing: not this day

      int ref = first - (InpCandleNumber - 1);
      if(ref < 1)
        {
         // Candle #N has not closed yet. Keep whatever we already had rather
         // than reading a high and low that are still moving.
         if(back == 0)
            return;
         continue;
        }

      if(bell != g_session_open)
        {
         g_session_open = bell;
         g_alerted_up   = false;
         g_alerted_down = false;
         g_signal       = 0;
        }

      g_ref_time  = iTime(_Symbol,  PERIOD_CURRENT, ref);
      g_ref_open  = iOpen(_Symbol,  PERIOD_CURRENT, ref);
      g_ref_high  = iHigh(_Symbol,  PERIOD_CURRENT, ref);
      g_ref_low   = iLow(_Symbol,   PERIOD_CURRENT, ref);
      g_ref_close = iClose(_Symbol, PERIOD_CURRENT, ref);
      g_have_ref  = true;

      DrawLevels();
      return;
     }
  }

//+------------------------------------------------------------------+
bool ReadIndicators(const int shift, double &ma, double &adx,
                    double &plus_di, double &minus_di)
  {
   double buffer[];
   if(CopyBuffer(g_ma_handle, 0, shift, 1, buffer) < 1) return(false);
   ma = buffer[0];
   if(CopyBuffer(g_adx_handle, 0, shift, 1, buffer) < 1) return(false);
   adx = buffer[0];
   if(CopyBuffer(g_adx_handle, 1, shift, 1, buffer) < 1) return(false);
   plus_di = buffer[0];
   if(CopyBuffer(g_adx_handle, 2, shift, 1, buffer) < 1) return(false);
   minus_di = buffer[0];
   return(true);
  }

//+------------------------------------------------------------------+
void CheckForBreak()
  {
   if(!g_have_ref)
      return;

   int ref_shift = iBarShift(_Symbol, PERIOD_CURRENT, g_ref_time, true);
   if(ref_shift < 0)
      return;
   if(ref_shift - 1 < InpConfirmBars)
      return;   // not enough closed bars after the reference candle yet

   bool up = true, down = true;
   for(int i = 1; i <= InpConfirmBars; i++)
     {
      double close_i = iClose(_Symbol, PERIOD_CURRENT, i);
      if(close_i <= g_ref_high) up   = false;
      if(close_i >= g_ref_low)  down = false;
     }

   if(!up && !down)
     {
      g_signal = 0;
      return;
     }

   double last = iClose(_Symbol, PERIOD_CURRENT, 1);

   if(InpUseFilters)
     {
      double ma, adx, plus_di, minus_di;
      if(!ReadIndicators(1, ma, adx, plus_di, minus_di))
         return;   // indicators not ready; try again on the next bar
      if(up   && !(last > ma && plus_di  > minus_di && adx >= InpAdxMinimum)) up   = false;
      if(down && !(last < ma && minus_di > plus_di  && adx >= InpAdxMinimum)) down = false;
     }

   if(up && !g_alerted_up)
     {
      g_signal       = 1;
      g_alerted_up   = true;
      g_alerted_down = false;
      RaiseAlert(1, last);
     }
   else
      if(down && !g_alerted_down)
        {
         g_signal       = -1;
         g_alerted_down = true;
         g_alerted_up   = false;
         RaiseAlert(-1, last);
        }
  }

//+------------------------------------------------------------------+
void RaiseAlert(const int direction, const double price)
  {
   string level = (direction > 0)
                  ? "high " + DoubleToString(g_ref_high, _Digits)
                  : "low "  + DoubleToString(g_ref_low,  _Digits);

   string text = StringFormat("%s %s  %s  |  close %s %s candle #%d %s  (candle %s, session %s)",
                              _Symbol,
                              TimeframeName(),
                              (direction > 0 ? "BULLISH" : "BEARISH"),
                              DoubleToString(price, _Digits),
                              (direction > 0 ? "broke above" : "broke below"),
                              InpCandleNumber,
                              level,
                              TimeToString(g_ref_time, TIME_MINUTES),
                              TimeToString(g_session_open, TIME_MINUTES));

   Print(text);
   if(InpPopupAlert) Alert(text);
   if(InpPushAlert)  SendNotification(text);
   if(InpSoundAlert) PlaySound(InpSoundFile);
  }

//+------------------------------------------------------------------+
void DrawLevels()
  {
   if(!InpDrawLevels)
      return;
   string label = "candle #" + IntegerToString(InpCandleNumber);
   DrawHLine(OBJ_PREFIX + "high", g_ref_high, InpHighColor, label + " high");
   DrawHLine(OBJ_PREFIX + "low",  g_ref_low,  InpLowColor,  label + " low");
  }

//+------------------------------------------------------------------+
void DrawHLine(const string name, const double price,
               const color line_colour, const string text)
  {
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_HLINE, 0, 0, price);
   ObjectSetDouble(0,  name, OBJPROP_PRICE, price);
   ObjectSetInteger(0, name, OBJPROP_COLOR, line_colour);
   ObjectSetInteger(0, name, OBJPROP_STYLE, STYLE_DASH);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, name, OBJPROP_BACK, true);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetString(0,  name, OBJPROP_TEXT, text);
   ObjectSetString(0,  name, OBJPROP_TOOLTIP,
                   text + " " + DoubleToString(price, _Digits));
  }

//+------------------------------------------------------------------+
string TimeframeName()
  {
   string name = EnumToString((ENUM_TIMEFRAMES)Period());
   StringReplace(name, "PERIOD_", "");
   return(name);
  }

//+------------------------------------------------------------------+
//| Where price is leaning while it is still inside the range.        |
//+------------------------------------------------------------------+
string CurrentBias()
  {
   if(!InpUseFilters)
      return("filters off");

   double ma, adx, plus_di, minus_di;
   if(!ReadIndicators(1, ma, adx, plus_di, minus_di))
      return("indicators not ready");

   double last  = iClose(_Symbol, PERIOD_CURRENT, 1);
   string trend = (adx >= InpAdxMinimum) ? "trending" : "no trend";
   string lean;

   if(last > ma && plus_di > minus_di)      lean = "leaning up";
   else if(last < ma && minus_di > plus_di) lean = "leaning down";
   else                                     lean = "undecided";

   return(StringFormat("%s, %s  (ADX %.1f, +DI %.1f, -DI %.1f, MA %s)",
                       lean, trend, adx, plus_di, minus_di,
                       DoubleToString(ma, _Digits)));
  }

//+------------------------------------------------------------------+
void UpdatePanel()
  {
   if(!InpShowPanel)
      return;

   uint now = GetTickCount();
   if(now - g_last_panel < 500)
      return;
   g_last_panel = now;

   string text = _Symbol + " " + TimeframeName() + "   candle #"
                 + IntegerToString(InpCandleNumber) + " of the session\n";

   if(!g_have_ref)
     {
      text += "waiting for candle #" + IntegerToString(InpCandleNumber)
              + " to close (session opens "
              + StringFormat("%02d:%02d", InpSessionHour, InpSessionMinute)
              + " server time)";
      Comment(text);
      return;
     }

   double range      = g_ref_high - g_ref_low;
   double body       = MathAbs(g_ref_close - g_ref_open);
   double body_share = (range > 0.0) ? body / range * 100.0 : 0.0;
   double bid        = SymbolInfoDouble(_Symbol, SYMBOL_BID);

   string verdict;
   if(g_signal > 0)
      verdict = "BULLISH - holding above " + DoubleToString(g_ref_high, _Digits);
   else
      if(g_signal < 0)
         verdict = "BEARISH - holding below " + DoubleToString(g_ref_low, _Digits);
      else
         verdict = "no break yet - inside "
                   + DoubleToString(g_ref_low, _Digits) + " - "
                   + DoubleToString(g_ref_high, _Digits);

   text += "session open  " + TimeToString(g_session_open, TIME_DATE | TIME_MINUTES) + "\n";
   text += "candle        " + TimeToString(g_ref_time, TIME_DATE | TIME_MINUTES) + "\n";
   text += "  open  " + DoubleToString(g_ref_open,  _Digits)
           + "   high " + DoubleToString(g_ref_high, _Digits) + "\n";
   text += "  close " + DoubleToString(g_ref_close, _Digits)
           + "   low  " + DoubleToString(g_ref_low,  _Digits) + "\n";
   text += StringFormat("  range %s   body %s (%.0f%%)\n",
                        DoubleToString(range, _Digits),
                        DoubleToString(body, _Digits), body_share);
   double delta = bid - g_ref_close;
   text += "price now     " + DoubleToString(bid, _Digits)
           + "  (" + (delta >= 0.0 ? "+" : "") + DoubleToString(delta, _Digits)
           + " vs the close)\n";
   text += "bias          " + CurrentBias() + "\n";
   text += "verdict       " + verdict;

   Comment(text);
  }
//+------------------------------------------------------------------+
