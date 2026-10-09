//+------------------------------------------------------------------+
//|                                                    EmoTrader.mq5 |
//|  Expert Advisor that analyses the market and trades with          |
//|  simulated FEAR and GREED.                                        |
//|                                                                  |
//|  Analysis : EMA trend, MACD momentum, RSI, Bollinger, ATR         |
//|  Market   : fear & greed index 0..100 (volatility, distance from  |
//|             recent high, distance from SMA, RSI, tick volume)     |
//|  Bot mind : fear and greed 0..1 from market contagion and from    |
//|             its own results (losses, streaks, drawdown, open P/L) |
//|  Emotions change entry threshold, lot size, SL/TP and can cause   |
//|  panic exits. "Discipline" sets how much emotions matter.        |
//|                                                                  |
//|  Default mode is ANALYZE ONLY: it never sends orders until you    |
//|  switch Mode to "Auto trade". Test on a demo account first.       |
//|                                                                  |
//|  This file is UTF-8 (with BOM) because it contains Persian text.  |
//+------------------------------------------------------------------+
#property copyright "EmoTrader"
#property version   "1.10"
#property description "Fear & greed trading robot. Default mode: analyze only (no orders)."
#property description "Attach to a gold chart (XAUUSD). Analysis timeframe is set in inputs."

#include <Trade\Trade.mqh>

//--- enums ----------------------------------------------------------
enum ENUM_EMO_LANG
  {
   EMO_LANG_FA = 0, // فارسی
   EMO_LANG_EN = 1  // English
  };

enum ENUM_EMO_MODE
  {
   EMO_ANALYZE_ONLY = 0, // فقط تحلیل (سیگنال و هشدار، بدون معامله)
   EMO_AUTO_TRADE   = 1  // معامله خودکار
  };

enum ENUM_EMO_PERSONALITY
  {
   EMO_ROBOT     = 0, // ربات بی‌احساس
   EMO_BALANCED  = 1, // متعادل
   EMO_EMOTIONAL = 2, // احساسی (پیرو جمع، فروش هیجانی)
   EMO_BUFFETT   = 3, // خلاف‌جهت (بافت)
   EMO_COWARD    = 4, // ترسو
   EMO_CUSTOM    = 5  // سفارشی (مقادیر پایین)
  };

enum ENUM_EMO_ACTION
  {
   ACT_HOLD  = 0,
   ACT_BUY   = 1,
   ACT_SELL  = 2,
   ACT_CLOSE = 3
  };

//--- inputs ---------------------------------------------------------
input group "عمومی"
input ENUM_EMO_LANG        InpLanguage    = EMO_LANG_FA;      // زبان پنل
input ENUM_EMO_MODE        InpMode        = EMO_ANALYZE_ONLY; // حالت
input ENUM_EMO_PERSONALITY InpPersonality = EMO_BALANCED;     // شخصیت ربات
input ENUM_TIMEFRAMES      InpTimeframe   = PERIOD_M5;        // تایم‌فریم تحلیل
input bool                 InpAllowShort  = true;             // اجازه معامله فروش
input ulong                InpMagic       = 20261009;         // مجیک نامبر

input group "مدیریت ریسک"
input double InpRiskPercent     = 0.5;  // ریسک هر معامله (درصد سرمایه)
input double InpStopATR         = 2.0;  // حد ضرر (ضریب ATR)
input double InpTakeProfitATR   = 3.0;  // حد سود (ضریب ATR)
input double InpEntryThreshold  = 0.30; // آستانه ورود (امتیاز ۰ تا ۱)
input double InpExitThreshold   = 0.10; // آستانه خروج وقتی امتیاز برخلاف پوزیشن شود
input double InpMaxSpreadATR    = 0.25; // حداکثر اسپرد مجاز (ضریب ATR)
input int    InpMaxTradesPerDay = 10;   // حداکثر معامله در روز
input double InpDailyLossPct    = 3.0;  // توقف بعد از این درصد ضرر روزانه

input group "شخصیت سفارشی"
input double InpFearSensitivity  = 1.0;  // حساسیت به ترس (۰ تا ۲)
input double InpGreedSensitivity = 1.0;  // حساسیت به طمع (۰ تا ۲)
input double InpDiscipline       = 0.6;  // انضباط (۱ = بی‌احساس، ۰ = کاملا احساسی)
input double InpContrarian       = 0.3;  // خلاف‌جهت بودن (۱ = کاملا خلاف جمع)
input double InpMemory           = 0.85; // حافظه احساسی در هر کندل (۰ تا ۱)

input group "هشدارها"
input bool InpAlerts = true;  // هشدار پاپ‌آپ روی سیگنال جدید
input bool InpPush   = false; // نوتیفیکیشن روی گوشی

//--- constants ------------------------------------------------------
#define EMO_LOOKBACK 130   // bars needed to analyse one bar
#define EMO_WARMUP   300   // bars replayed at start to build the mood

// panel geometry
#define PNL_X      10
#define PNL_Y      22
#define PNL_W      500
#define PNL_ROW_H  19
#define PNL_PREFIX "EMO_"

#define CLR_BG      C'16,20,28'
#define CLR_BORDER  C'212,170,70'
#define CLR_TITLE   C'160,170,188'
#define CLR_TEXT    C'235,238,245'
#define CLR_SECTION C'230,190,90'
#define CLR_GOOD    C'70,205,125'
#define CLR_BAD     C'240,95,95'
#define CLR_WARN    C'240,180,70'

//--- types ----------------------------------------------------------
struct SAnalysis
  {
   datetime time;
   double   price;
   double   atr;
   double   score;      // -1 strong sell .. +1 strong buy
   double   trend;      // -1..1
   double   momentum;   // -1..1
   double   rsi;
   double   fg;         // market fear & greed 0..100
   double   volRatio;   // short-term volatility / long-term volatility
   double   ddAtr;      // distance below the 50-bar high, in ATR
  };

struct SDecision
  {
   int    action;
   bool   panic;
   double threshold;
   double sizeMult;
   double stopAtr;
   double tpAtr;
   string note;    // main reason (no numbers, so Persian renders cleanly)
   string note2;   // extra remark (FOMO, contrarian view)
  };

//--- globals --------------------------------------------------------
CTrade   trade;
int      hEmaFast = INVALID_HANDLE, hEmaSlow = INVALID_HANDLE, hSma = INVALID_HANDLE;
int      hRsi = INVALID_HANDLE, hMacd = INVALID_HANDLE, hBands = INVALID_HANDLE, hAtr = INVALID_HANDLE;

double   gEmaF[], gEmaS[], gSma[], gRsi[], gMacdM[], gMacdS[], gBbU[], gBbL[], gAtr[], gClose[];
long     gVol[];

// personality
double   gFearSens, gGreedSens, gDiscipline, gContrarian, gMemory;

// emotional state
double   gFear = 0.2, gGreed = 0.2;
int      gWinStreak = 0, gLossStreak = 0;

// bookkeeping
bool      gReady = false;
datetime  gLastBar = 0;
SAnalysis gLast;
SDecision gDecision;
int       gLastSignal = ACT_HOLD;
double    gEquityPeak = 0.0;
double    gEntryRisk = 0.0;   // money at risk on the open trade
int       gDay = -1;
double    gDayStartEquity = 0.0;
int       gTradesToday = 0;
string    gEventText = "";    // last event, words only
string    gEventValue = "";   // last event, numbers only

// panel
int       gRow = 0;
int       gPanelRows = 0;

//+------------------------------------------------------------------+
//| language                                                         |
//+------------------------------------------------------------------+
bool IsFa()
  {
   return InpLanguage == EMO_LANG_FA;
  }

string L(const string fa, const string en)
  {
   return IsFa() ? fa : en;
  }

//+------------------------------------------------------------------+
//| small math helpers                                               |
//+------------------------------------------------------------------+
double Clamp(const double x, const double lo, const double hi)
  {
   return MathMax(lo, MathMin(hi, x));
  }

double Tanh(const double x)
  {
   double c = Clamp(x, -20.0, 20.0);
   double e = MathExp(2.0 * c);
   return (e - 1.0) / (e + 1.0);
  }

// linear map of x from [lo, hi] to [0, 100]
double Scale(const double x, const double lo, const double hi)
  {
   return Clamp((x - lo) / (hi - lo), 0.0, 1.0) * 100.0;
  }

string Bar(const double v, const int width = 20)
  {
   int n = (int)MathRound(Clamp(v, 0.0, 1.0) * width);
   string s = "[";
   for(int i = 0; i < width; i++)
      s += (i < n ? "|" : ".");
   return s + "]";
  }

//+------------------------------------------------------------------+
//| words                                                            |
//+------------------------------------------------------------------+
string FgLabel(const double v)
  {
   if(v < 20) return L("ترس شدید", "EXTREME FEAR");
   if(v < 40) return L("ترس", "FEAR");
   if(v < 60) return L("خنثی", "NEUTRAL");
   if(v < 80) return L("طمع", "GREED");
   return L("طمع شدید", "EXTREME GREED");
  }

string MoodEn()
  {
   if(gFear > 0.8)  return "PANIC";
   if(gGreed > 0.8) return "FOMO";
   double b = gGreed - gFear;
   if(b < -0.35) return "SCARED";
   if(b < -0.10) return "CAUTIOUS";
   if(b <= 0.10) return "CALM";
   if(b <= 0.35) return "EAGER";
   return "GREEDY";
  }

string Mood()
  {
   string en = MoodEn();
   if(!IsFa())
      return en;
   if(en == "PANIC")    return "وحشت‌زده";
   if(en == "FOMO")     return "سرمست / فومو";
   if(en == "SCARED")   return "ترسیده";
   if(en == "CAUTIOUS") return "محتاط";
   if(en == "CALM")     return "آرام";
   if(en == "EAGER")    return "مشتاق";
   return "طمع‌کار";
  }

color MoodColor()
  {
   double b = gGreed - gFear;
   if(b < -0.10) return CLR_BAD;
   if(b > 0.10)  return CLR_GOOD;
   return CLR_TEXT;
  }

string ActionName(const int a)
  {
   switch(a)
     {
      case ACT_BUY:   return L("خرید", "BUY");
      case ACT_SELL:  return L("فروش", "SELL");
      case ACT_CLOSE: return L("بستن پوزیشن", "CLOSE");
     }
   return L("صبر", "HOLD");
  }

color ActionColor(const int a)
  {
   if(a == ACT_BUY)   return CLR_GOOD;
   if(a == ACT_SELL)  return CLR_BAD;
   if(a == ACT_CLOSE) return CLR_WARN;
   return CLR_TEXT;
  }

string PersonalityName()
  {
   switch(InpPersonality)
     {
      case EMO_ROBOT:     return L("ربات بی‌احساس", "Robot");
      case EMO_EMOTIONAL: return L("احساسی", "Emotional");
      case EMO_BUFFETT:   return L("خلاف‌جهت (بافت)", "Contrarian");
      case EMO_COWARD:    return L("ترسو", "Coward");
      case EMO_CUSTOM:    return L("سفارشی", "Custom");
     }
   return L("متعادل", "Balanced");
  }

//+------------------------------------------------------------------+
//| personality                                                      |
//+------------------------------------------------------------------+
void ApplyPersonality()
  {
   // fear sens, greed sens, discipline, contrarian, memory
   switch(InpPersonality)
     {
      case EMO_ROBOT:
         gFearSens = 1.0; gGreedSens = 1.0; gDiscipline = 1.0;  gContrarian = 0.3; gMemory = 0.85; break;
      case EMO_EMOTIONAL:
         gFearSens = 1.4; gGreedSens = 1.4; gDiscipline = 0.15; gContrarian = 0.0; gMemory = 0.90; break;
      case EMO_BUFFETT:
         gFearSens = 0.7; gGreedSens = 0.9; gDiscipline = 0.5;  gContrarian = 0.9; gMemory = 0.90; break;
      case EMO_COWARD:
         gFearSens = 1.8; gGreedSens = 0.5; gDiscipline = 0.3;  gContrarian = 0.1; gMemory = 0.85; break;
      case EMO_CUSTOM:
         gFearSens   = Clamp(InpFearSensitivity, 0.0, 3.0);
         gGreedSens  = Clamp(InpGreedSensitivity, 0.0, 3.0);
         gDiscipline = Clamp(InpDiscipline, 0.0, 1.0);
         gContrarian = Clamp(InpContrarian, 0.0, 1.0);
         gMemory     = Clamp(InpMemory, 0.0, 0.99);
         break;
      default:
         gFearSens = 1.0; gGreedSens = 1.0; gDiscipline = 0.6;  gContrarian = 0.3; gMemory = 0.85; break;
     }
  }

//+------------------------------------------------------------------+
//| data                                                             |
//+------------------------------------------------------------------+
bool IndicatorsReady(const int need)
  {
   int h[7];
   h[0] = hEmaFast; h[1] = hEmaSlow; h[2] = hSma; h[3] = hRsi; h[4] = hMacd; h[5] = hBands; h[6] = hAtr;
   for(int i = 0; i < 7; i++)
      if(BarsCalculated(h[i]) < need)
         return false;
   return true;
  }

// copies `count` bars starting at the forming bar; index i == bar shift i
bool LoadData(const int count)
  {
   if(CopyBuffer(hEmaFast, 0, 0, count, gEmaF) != count) return false;
   if(CopyBuffer(hEmaSlow, 0, 0, count, gEmaS) != count) return false;
   if(CopyBuffer(hSma,     0, 0, count, gSma)  != count) return false;
   if(CopyBuffer(hRsi,     0, 0, count, gRsi)  != count) return false;
   if(CopyBuffer(hMacd,    0, 0, count, gMacdM) != count) return false;
   if(CopyBuffer(hMacd,    1, 0, count, gMacdS) != count) return false;
   if(CopyBuffer(hBands,   1, 0, count, gBbU)  != count) return false;
   if(CopyBuffer(hBands,   2, 0, count, gBbL)  != count) return false;
   if(CopyBuffer(hAtr,     0, 0, count, gAtr)  != count) return false;
   if(CopyClose(_Symbol, InpTimeframe, 0, count, gClose) != count) return false;
   if(CopyTickVolume(_Symbol, InpTimeframe, 0, count, gVol) != count) return false;
   return true;
  }

double ReturnsStd(const int from, const int n)
  {
   double sum = 0.0, sum2 = 0.0;
   for(int i = from; i < from + n; i++)
     {
      double r = gClose[i] / gClose[i + 1] - 1.0;
      sum += r;
      sum2 += r * r;
     }
   double mean = sum / n;
   return MathSqrt(MathMax(0.0, sum2 / n - mean * mean));
  }

// full analysis of the closed bar at shift s (needs s + EMO_LOOKBACK loaded bars)
bool ComputeAt(const int s, SAnalysis &a)
  {
   if(s + EMO_LOOKBACK > ArraySize(gClose))
      return false;
   double atr = gAtr[s];
   if(atr <= 0.0 || gClose[s] <= 0.0)
      return false;

   a.time  = iTime(_Symbol, InpTimeframe, s);
   a.price = gClose[s];
   a.atr   = atr;
   a.rsi   = gRsi[s];

   //--- signal score
   a.trend    = Tanh((gEmaF[s] - gEmaS[s]) / atr);
   a.momentum = Tanh((gMacdM[s] - gMacdS[s]) / atr * 2.0);
   double r = gRsi[s];
   // normal zone confirms the trend, overbought/oversold warns of reversal
   double rsiPart = (MathAbs(r - 50.0) > 20.0) ? Tanh((50.0 - r) / 15.0) : (r - 50.0) / 40.0;
   double width = gBbU[s] - gBbL[s];
   double pctb = (width > 0.0) ? (gClose[s] - gBbL[s]) / width : 0.5;
   double bbPart = Clamp(0.5 - pctb, -1.0, 1.0);
   a.score = Clamp(0.4 * a.trend + 0.3 * a.momentum + 0.15 * rsiPart + 0.15 * bbPart, -1.0, 1.0);

   //--- market fear & greed index
   double shortStd = ReturnsStd(s, 20);
   double longStd  = ReturnsStd(s, 120);
   a.volRatio = (longStd > 0.0) ? shortStd / longStd : 1.0;

   double hi = gClose[s];
   for(int i = s; i < s + 50; i++)
      hi = MathMax(hi, gClose[i]);
   a.ddAtr = (hi - gClose[s]) / atr;

   double volAvg = 0.0;
   for(int i = s; i < s + 20; i++)
      volAvg += (double)gVol[i];
   volAvg /= 20.0;
   double volZ = (volAvg > 0.0) ? (double)gVol[s] / volAvg : 1.0;
   double dir = (gClose[s] > gClose[s + 1]) ? 1.0 : ((gClose[s] < gClose[s + 1]) ? -1.0 : 0.0);

   double p1 = 100.0 - Scale(a.volRatio, 0.6, 1.8);            // high volatility = fear
   double p2 = 100.0 - Scale(a.ddAtr, 0.0, 6.0);               // far below recent high = fear
   double p3 = Scale((gClose[s] - gSma[s]) / atr, -3.0, 3.0);  // above average = greed
   double p4 = Scale(r, 25.0, 75.0);                           // high RSI = greed
   double p5 = 50.0 + dir * Scale(volZ, 1.0, 3.0) / 2.0;       // heavy volume: panic selling or buying rush
   a.fg = (p1 + p2 + p3 + p4 + p5) / 5.0;
   return true;
  }

//+------------------------------------------------------------------+
//| emotions                                                         |
//+------------------------------------------------------------------+
// equityDD: drawdown of the account from its peak (0.05 = 5%)
// posAtr  : open trade result in ATR units (positive = winning)
void UpdateEmotions(const double fg, const double equityDD, const bool hasPos, const double posAtr)
  {
   double c = gContrarian;
   double mFear  = MathMax(0.0, (50.0 - fg) / 50.0);
   double mGreed = MathMax(0.0, (fg - 50.0) / 50.0);

   // contagion from the market; a contrarian sees crowd fear as opportunity
   double ft = (1.0 - c) * mFear  + c * mGreed * 0.7;
   double gt = (1.0 - c) * mGreed + c * mFear  * 0.7;

   // personal experience
   ft += MathMin(1.0, equityDD / 0.10) * 0.5;
   ft += MathMin(gLossStreak, 4) * 0.08;
   gt += MathMin(gWinStreak, 4) * 0.08;
   if(hasPos)
     {
      if(posAtr < 0.0)
         ft += MathMin(1.0, -posAtr / 1.5) * 0.3;
      else
         gt += MathMin(1.0, posAtr / 2.0) * 0.3;
     }

   ft = Clamp(ft * gFearSens, 0.0, 1.0);
   gt = Clamp(gt * gGreedSens, 0.0, 1.0);
   gFear  = Clamp(gMemory * gFear  + (1.0 - gMemory) * ft, 0.0, 1.0);
   gGreed = Clamp(gMemory * gGreed + (1.0 - gMemory) * gt, 0.0, 1.0);
  }

// emotional shock after a closed trade; rMultiple = profit / money risked
void OnTradeClosedEmotion(const double rMultiple)
  {
   if(rMultiple < 0.0)
     {
      gLossStreak++;
      gWinStreak = 0;
      double shock = MathMin(0.5, -rMultiple * 0.25) * gFearSens;
      gFear  = MathMin(1.0, gFear + shock);
      gGreed = MathMax(0.0, gGreed - shock / 2.0);
     }
   else
     {
      gWinStreak++;
      gLossStreak = 0;
      double boost = MathMin(0.4, rMultiple * 0.15) * gGreedSens;
      gGreed = MathMin(1.0, gGreed + boost);
      gFear  = MathMax(0.0, gFear - boost / 2.0);
     }
  }

//+------------------------------------------------------------------+
//| decision                                                         |
//+------------------------------------------------------------------+
// posDir: 1 long, -1 short, 0 flat. posAtr: open trade result in ATR.
void Decide(const SAnalysis &a, const int posDir, const double posAtr, SDecision &d)
  {
   double w = 1.0 - gDiscipline;
   double f = gFear, g = gGreed;

   d.panic     = false;
   d.note2     = "";
   d.threshold = MathMax(0.05, InpEntryThreshold * (1.0 + w * (1.2 * f - 0.8 * g)));
   d.sizeMult  = Clamp(1.0 + w * (1.5 * g - 1.2 * f), 0.2, 2.5);
   d.stopAtr   = InpStopATR * (1.0 - 0.4 * w * f + 0.4 * w * g);
   d.tpAtr     = InpTakeProfitATR * (1.0 - 0.4 * w * f + 0.6 * w * g);
   double exitLevel = InpExitThreshold + 0.3 * w * g - 0.2 * w * f;

   d.action = ACT_HOLD;
   if(posDir != 0)
     {
      if(w * f > 0.55 && posAtr < 0.0)
        {
         d.action = ACT_CLOSE;
         d.panic  = true;
         d.note   = L("وحشت! ترس بر عقل غلبه کرد و معامله ضررده را می‌بندد",
                      "PANIC: fear beat reason, closing the losing trade");
        }
      else if((posDir > 0 && a.score < -exitLevel) || (posDir < 0 && a.score > exitLevel))
        {
         d.action = ACT_CLOSE;
         d.note   = L("امتیاز تحلیل برخلاف پوزیشن چرخید", "Score turned against the position");
        }
      else
         d.note = L("پوزیشن حفظ می‌شود", "Holding the position");
     }
   else
     {
      if(a.score >= d.threshold)
         d.action = ACT_BUY;
      else if(InpAllowShort && a.score <= -d.threshold)
         d.action = ACT_SELL;

      if(d.action != ACT_HOLD)
        {
         d.note = L("امتیاز تحلیل از آستانه ورود عبور کرد", "Score passed the entry threshold");
         if(g > f && d.threshold < InpEntryThreshold)
            d.note2 = L("طمع آستانه را پایین آورد؛ کمی فومو در کار است", "Greed lowered the bar: a bit of FOMO");
        }
      else if(a.score >= InpEntryThreshold)
         d.note = L("تحلیل می‌گوید بخر، اما ترس اجازه نمی‌دهد", "Analysis says BUY, but fear says no");
      else if(InpAllowShort && a.score <= -InpEntryThreshold)
         d.note = L("تحلیل می‌گوید بفروش، اما ترس اجازه نمی‌دهد", "Analysis says SELL, but fear says no");
      else
         d.note = L("سیگنال به اندازه کافی قوی نیست", "Signal is too weak");
     }

   if(gContrarian > 0.6 && a.fg < 25.0)
      d.note2 = L("بازار در ترس شدید است؛ از نگاه خلاف‌جهت یعنی فرصت", "Crowd is terrified: contrarian sees opportunity");
   else if(gContrarian > 0.6 && a.fg > 75.0)
      d.note2 = L("بازار در طمع شدید است؛ وقت احتیاط است", "Crowd is euphoric: time to be careful");
  }

//+------------------------------------------------------------------+
//| positions and orders                                             |
//+------------------------------------------------------------------+
// finds this EA's position on this symbol; returns false if none
bool GetPosition(ulong &ticket, int &dir, double &openPrice, double &volume, double &profit)
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0)
         continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol || PositionGetInteger(POSITION_MAGIC) != (long)InpMagic)
         continue;
      ticket    = t;
      dir       = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? 1 : -1;
      openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      volume    = PositionGetDouble(POSITION_VOLUME);
      profit    = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
      return true;
     }
   return false;
  }

// lot size so that hitting the stop loses about riskMoney
double CalcLots(const double stopDist, const double riskMoney, double &riskTaken)
  {
   riskTaken = 0.0;
   double tickSize  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE_LOSS);
   if(tickValue <= 0.0)
      tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double minL = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxL = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(tickSize <= 0.0 || tickValue <= 0.0 || step <= 0.0 || stopDist <= 0.0)
      return 0.0;

   double lossPerLot = stopDist / tickSize * tickValue;
   double lots = MathFloor(riskMoney / lossPerLot / step) * step;
   if(lots < minL)
     {
      if(minL * lossPerLot > riskMoney * 3.0)
         return 0.0;   // even the minimum lot is far too risky for this account
      lots = minL;
     }
   lots = MathMin(lots, maxL);

   double margin = 0.0;
   double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   if(OrderCalcMargin(ORDER_TYPE_BUY, _Symbol, lots, SymbolInfoDouble(_Symbol, SYMBOL_ASK), margin)
      && margin > freeMargin * 0.9 && margin > 0.0)
     {
      lots = MathFloor(lots * freeMargin * 0.9 / margin / step) * step;
      if(lots < minL)
         return 0.0;
     }

   int digits = (int)MathMax(0.0, MathRound(-MathLog10(step)));
   lots = NormalizeDouble(lots, digits);
   riskTaken = lots * lossPerLot;
   return lots;
  }

void SetEvent(const string text, const string value)
  {
   gEventText  = text;
   gEventValue = value;
   Print("EmoTrader: ", text, "  ", value);
  }

// returns "" when a new trade is allowed, otherwise the reason it is not
string BlockReason(const SAnalysis &a)
  {
   if(InpMode != EMO_AUTO_TRADE)
      return L("حالت فقط تحلیل", "analyze-only mode");
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED))
      return L("الگو تریدینگ در متاتریدر خاموش است", "Algo Trading is disabled in the terminal");
   if(gTradesToday >= InpMaxTradesPerDay)
      return L("سقف معاملات امروز پر شده", "daily trade limit reached");
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   if(gDayStartEquity > 0.0 && equity < gDayStartEquity * (1.0 - InpDailyLossPct / 100.0))
      return L("به سقف ضرر روزانه رسیدیم", "daily loss limit reached");
   double spread = SymbolInfoDouble(_Symbol, SYMBOL_ASK) - SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(spread > InpMaxSpreadATR * a.atr)
      return L("اسپرد خیلی زیاد است", "spread too wide");
   return "";
  }

void OpenTrade(const int dir, const SAnalysis &a, const SDecision &d)
  {
   string blocked = BlockReason(a);
   if(blocked != "")
     {
      if(InpMode == EMO_AUTO_TRADE)
         SetEvent(L("معامله باز نشد: ", "Not opened: ") + blocked, "");
      return;
     }

   double point    = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   double minDist  = (double)(SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) + SymbolInfoInteger(_Symbol, SYMBOL_SPREAD)) * point;
   double stopDist = MathMax(d.stopAtr * a.atr, minDist);
   double tpDist   = MathMax(d.tpAtr * a.atr, minDist);

   double riskMoney = AccountInfoDouble(ACCOUNT_EQUITY) * InpRiskPercent / 100.0 * d.sizeMult;
   double riskTaken = 0.0;
   double lots = CalcLots(stopDist, riskMoney, riskTaken);
   if(lots <= 0.0)
     {
      SetEvent(L("معامله باز نشد: سرمایه برای حداقل لات کافی نیست", "Not opened: account too small for the minimum lot"), "");
      return;
     }

   double price = (dir > 0) ? SymbolInfoDouble(_Symbol, SYMBOL_ASK) : SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double sl = NormalizeDouble(dir > 0 ? price - stopDist : price + stopDist, _Digits);
   double tp = NormalizeDouble(dir > 0 ? price + tpDist : price - tpDist, _Digits);
   string comment = "Emo " + MoodEn();

   bool ok = (dir > 0) ? trade.Buy(lots, _Symbol, 0.0, sl, tp, comment)
                       : trade.Sell(lots, _Symbol, 0.0, sl, tp, comment);
   if(ok && (trade.ResultRetcode() == TRADE_RETCODE_DONE || trade.ResultRetcode() == TRADE_RETCODE_PLACED))
     {
      gTradesToday++;
      gEntryRisk = riskTaken;
      SetEvent(dir > 0 ? L("خرید باز شد", "BUY opened") : L("فروش باز شد", "SELL opened"),
               StringFormat("%.2f lot @ %s  SL %s  TP %s", lots, DoubleToString(price, _Digits),
                            DoubleToString(sl, _Digits), DoubleToString(tp, _Digits)));
     }
   else
      SetEvent(L("خطا در ارسال سفارش", "Order failed"), trade.ResultRetcodeDescription());
  }

void Notify(const string text)
  {
   if(InpAlerts)
      Alert(text);
   if(InpPush)
      SendNotification(text);
  }

//+------------------------------------------------------------------+
//| day bookkeeping                                                  |
//+------------------------------------------------------------------+
void CheckNewDay()
  {
   MqlDateTime t;
   TimeToStruct(TimeCurrent(), t);
   if(t.day_of_year != gDay)
     {
      gDay = t.day_of_year;
      gDayStartEquity = AccountInfoDouble(ACCOUNT_EQUITY);
      gTradesToday = 0;
     }
  }

//+------------------------------------------------------------------+
//| warm-up: replay history so the bot starts with a real mood       |
//+------------------------------------------------------------------+
bool Warmup()
  {
   int need = EMO_WARMUP + EMO_LOOKBACK + 5;
   if(Bars(_Symbol, InpTimeframe) < need || !IndicatorsReady(need))
      return false;
   if(!LoadData(need))
      return false;
   SAnalysis a;
   for(int s = EMO_WARMUP; s >= 1; s--)
      if(ComputeAt(s, a))
         UpdateEmotions(a.fg, 0.0, false, 0.0);
   return true;
  }

//+------------------------------------------------------------------+
//| one decision per closed bar                                      |
//+------------------------------------------------------------------+
void OnNewBar()
  {
   if(!LoadData(EMO_LOOKBACK + 5))
      return;
   SAnalysis a;
   if(!ComputeAt(1, a))
      return;
   gLast = a;
   CheckNewDay();

   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   gEquityPeak = MathMax(gEquityPeak, equity);
   double dd = (gEquityPeak > 0.0) ? 1.0 - equity / gEquityPeak : 0.0;

   ulong ticket = 0;
   int posDir = 0;
   double openPrice = 0.0, volume = 0.0, profit = 0.0, posAtr = 0.0;
   bool hasPos = GetPosition(ticket, posDir, openPrice, volume, profit);
   if(hasPos)
     {
      double now = (posDir > 0) ? SymbolInfoDouble(_Symbol, SYMBOL_BID) : SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      posAtr = (now - openPrice) * posDir / a.atr;
     }

   UpdateEmotions(a.fg, dd, hasPos, posAtr);
   Decide(a, hasPos ? posDir : 0, posAtr, gDecision);

   if(gDecision.action == ACT_CLOSE && hasPos && InpMode == EMO_AUTO_TRADE)
     {
      if(trade.PositionClose(ticket))
         SetEvent(gDecision.panic ? L("بستن از روی وحشت", "PANIC CLOSE") : L("پوزیشن بسته شد", "Position closed"), "");
      else
         SetEvent(L("خطا در بستن پوزیشن", "Close failed"), trade.ResultRetcodeDescription());
     }

   int signal = (gDecision.action == ACT_BUY || gDecision.action == ACT_SELL) ? gDecision.action : (int)ACT_HOLD;
   if(signal != ACT_HOLD && signal != gLastSignal)
      Notify(StringFormat("EmoTrader %s %s: %s @ %s | %s %+.2f | %s %.0f | %s",
                          _Symbol, StringSubstr(EnumToString(InpTimeframe), 7), ActionName(signal),
                          DoubleToString(a.price, _Digits), L("امتیاز", "score"), a.score,
                          L("ترس و طمع بازار", "F&G"), a.fg, Mood()));
   gLastSignal = signal;

   if(signal != ACT_HOLD && !hasPos)
      OpenTrade(signal == ACT_BUY ? 1 : -1, a, gDecision);
  }

//+------------------------------------------------------------------+
//| on-chart panel: a framed box, one line per row                   |
//| Persian: title on the right, words next to it, numbers on the     |
//| left. Words and numbers live in separate labels so right-to-left  |
//| text never gets mixed with numbers.                              |
//+------------------------------------------------------------------+
void PanelLabel(const string name, const int x, const int y, const string text, const color clr,
                const ENUM_ANCHOR_POINT anchor, const string font, const int size)
  {
   if(ObjectFind(0, name) < 0)
     {
      ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
      ObjectSetInteger(0, name, OBJPROP_BACK, false);
     }
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_ANCHOR, anchor);
   ObjectSetString(0, name, OBJPROP_TEXT, text == "" ? " " : text);
   ObjectSetString(0, name, OBJPROP_FONT, font);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, size);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
  }

void PanelBox(const int height)
  {
   string name = PNL_PREFIX + "BG";
   if(ObjectFind(0, name) < 0)
     {
      ObjectCreate(0, name, OBJ_RECTANGLE_LABEL, 0, 0, 0);
      ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, name, OBJPROP_XDISTANCE, PNL_X);
      ObjectSetInteger(0, name, OBJPROP_YDISTANCE, PNL_Y);
      ObjectSetInteger(0, name, OBJPROP_XSIZE, PNL_W);
      ObjectSetInteger(0, name, OBJPROP_BGCOLOR, CLR_BG);
      ObjectSetInteger(0, name, OBJPROP_BORDER_TYPE, BORDER_FLAT);
      ObjectSetInteger(0, name, OBJPROP_COLOR, CLR_BORDER);
      ObjectSetInteger(0, name, OBJPROP_WIDTH, 2);
      ObjectSetInteger(0, name, OBJPROP_BACK, false);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
     }
   ObjectSetInteger(0, name, OBJPROP_YSIZE, height);
  }

// one row: title, words (Persian-safe), value (numbers only)
void Row(const string title, const string words = "", const string value = "",
         const color wordsClr = CLR_TEXT, const color valueClr = CLR_TEXT, const color titleClr = CLR_TITLE)
  {
   int y = PNL_Y + 8 + gRow * PNL_ROW_H;
   string id = IntegerToString(gRow);
   if(IsFa())
     {
      PanelLabel(PNL_PREFIX + "T" + id, PNL_X + PNL_W - 12,  y, title, titleClr, ANCHOR_RIGHT_UPPER, "Tahoma", 9);
      PanelLabel(PNL_PREFIX + "W" + id, PNL_X + PNL_W - 170, y, words, wordsClr, ANCHOR_RIGHT_UPPER, "Tahoma", 9);
      PanelLabel(PNL_PREFIX + "V" + id, PNL_X + 12,          y, value, valueClr, ANCHOR_LEFT_UPPER,  "Consolas", 9);
     }
   else
     {
      PanelLabel(PNL_PREFIX + "T" + id, PNL_X + 12,          y, title, titleClr, ANCHOR_LEFT_UPPER,  "Tahoma", 9);
      PanelLabel(PNL_PREFIX + "W" + id, PNL_X + 150,         y, words, wordsClr, ANCHOR_LEFT_UPPER,  "Tahoma", 9);
      PanelLabel(PNL_PREFIX + "V" + id, PNL_X + PNL_W - 12,  y, value, valueClr, ANCHOR_RIGHT_UPPER, "Consolas", 9);
     }
   gRow++;
  }

void Section(const string title)
  {
   Row(title, "", "", CLR_TEXT, CLR_TEXT, CLR_SECTION);
  }

void UpdatePanel()
  {
   if(MQLInfoInteger(MQL_TESTER) && !MQLInfoInteger(MQL_VISUAL_MODE))
      return;
   gRow = 0;
   string tf = StringSubstr(EnumToString(InpTimeframe), 7);
   bool autoMode = (InpMode == EMO_AUTO_TRADE);

   Row(autoMode ? L("معامله خودکار", "AUTO TRADE") : L("فقط تحلیل", "ANALYZE ONLY"),
       PersonalityName(), "EmoTrader  " + _Symbol + "  " + tf,
       CLR_TEXT, CLR_BORDER, autoMode ? CLR_WARN : CLR_GOOD);

   if(!gReady)
      Row(L("صبر کنید", "Please wait"), L("در حال خواندن تاریخچه و ساختن حال ربات", "Loading history and building the mood"));
   else
     {
      double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double spread = SymbolInfoDouble(_Symbol, SYMBOL_ASK) - bid;

      Section(L("بازار", "MARKET"));
      Row(L("قیمت", "Price"), "", DoubleToString(bid, _Digits));
      Row(L("اسپرد", "Spread"), "", StringFormat("%.2f ATR", gLast.atr > 0 ? spread / gLast.atr : 0.0));
      Row(L("روند", "Trend"), gLast.trend >= 0 ? L("صعودی", "up") : L("نزولی", "down"),
          StringFormat("%+.2f", gLast.trend), gLast.trend >= 0 ? CLR_GOOD : CLR_BAD);
      Row(L("مومنتوم", "Momentum"), gLast.momentum >= 0 ? L("مثبت", "positive") : L("منفی", "negative"),
          StringFormat("%+.2f", gLast.momentum), gLast.momentum >= 0 ? CLR_GOOD : CLR_BAD);
      string rsiWord = (gLast.rsi >= 70) ? L("اشباع خرید", "overbought")
                       : ((gLast.rsi <= 30) ? L("اشباع فروش", "oversold") : L("عادی", "normal"));
      Row("RSI", rsiWord, StringFormat("%.0f", gLast.rsi));
      string volWord = (gLast.volRatio > 1.4) ? L("ملتهب", "heated")
                       : ((gLast.volRatio < 0.75) ? L("آرام", "quiet") : L("عادی", "normal"));
      Row(L("نوسان", "Volatility vs normal"), volWord, StringFormat("x%.2f", gLast.volRatio));
      Row(L("فاصله از سقف", "Below recent high"), "", StringFormat("%.1f ATR", gLast.ddAtr));
      string scoreWord = (gLast.score > 0.1) ? L("تمایل به خرید", "leaning buy")
                         : ((gLast.score < -0.1) ? L("تمایل به فروش", "leaning sell") : L("خنثی", "neutral"));
      Row(L("امتیاز تحلیل", "Signal score"), scoreWord, StringFormat("%+.2f", gLast.score),
          gLast.score > 0.1 ? CLR_GOOD : (gLast.score < -0.1 ? CLR_BAD : CLR_TEXT));
      Row(L("ترس و طمع بازار", "Market fear & greed"), FgLabel(gLast.fg),
          StringFormat("%3.0f ", gLast.fg) + Bar(gLast.fg / 100.0), gLast.fg < 40 ? CLR_BAD : (gLast.fg > 60 ? CLR_GOOD : CLR_TEXT));

      Section(L("ذهن ربات", "BOT MIND"));
      Row(L("ترس", "Fear"), "", StringFormat("%3.0f%% ", gFear * 100.0) + Bar(gFear), CLR_TEXT, CLR_BAD);
      Row(L("طمع", "Greed"), "", StringFormat("%3.0f%% ", gGreed * 100.0) + Bar(gGreed), CLR_TEXT, CLR_GOOD);
      Row(L("حال ربات", "Mood"), Mood(), "", MoodColor());
      Row(L("برد / باخت پیاپی", "Wins / losses in a row"), "", StringFormat("%d / %d", gWinStreak, gLossStreak));

      Section(L("تصمیم", "DECISION"));
      Row(L("تصمیم", "Action"), ActionName(gDecision.action), "", ActionColor(gDecision.action));
      Row(L("دلیل", "Reason"), gDecision.note);
      if(gDecision.note2 != "")
         Row("", gDecision.note2, "", CLR_WARN);
      Row(L("آستانه ورود", "Entry threshold"), "", StringFormat("%.2f", gDecision.threshold));
      Row(L("ضریب حجم", "Size multiplier"), "", StringFormat("x%.2f", gDecision.sizeMult));
      Row(L("حد ضرر / حد سود", "Stop / target"), "", StringFormat("%.1f / %.1f ATR", gDecision.stopAtr, gDecision.tpAtr));

      Section(L("حساب", "ACCOUNT"));
      ulong ticket = 0;
      int dir = 0;
      double openPrice = 0.0, volume = 0.0, profit = 0.0;
      if(GetPosition(ticket, dir, openPrice, volume, profit))
         Row(L("پوزیشن", "Position"), dir > 0 ? L("خرید", "long") : L("فروش", "short"),
             StringFormat("%.2f lot @ %s  P/L %+.2f", volume, DoubleToString(openPrice, _Digits), profit),
             dir > 0 ? CLR_GOOD : CLR_BAD, profit >= 0 ? CLR_GOOD : CLR_BAD);
      else
         Row(L("پوزیشن", "Position"), L("ندارد", "none"));
      double dayPl = (gDayStartEquity > 0.0) ? AccountInfoDouble(ACCOUNT_EQUITY) / gDayStartEquity - 1.0 : 0.0;
      Row(L("معاملات و سود امروز", "Today trades / P&L"), "",
          StringFormat("%d/%d   %+.2f%%", gTradesToday, InpMaxTradesPerDay, dayPl * 100.0),
          CLR_TEXT, dayPl >= 0 ? CLR_GOOD : CLR_BAD);
      if(gEventText != "")
        {
         Row(L("آخرین رویداد", "Last event"), gEventText, "", CLR_WARN);
         if(gEventValue != "")
            Row("", "", gEventValue);
        }
     }

   // blank rows left over from a longer previous frame
   for(int i = gRow; i < gPanelRows; i++)
     {
      string id = IntegerToString(i);
      ObjectSetString(0, PNL_PREFIX + "T" + id, OBJPROP_TEXT, " ");
      ObjectSetString(0, PNL_PREFIX + "W" + id, OBJPROP_TEXT, " ");
      ObjectSetString(0, PNL_PREFIX + "V" + id, OBJPROP_TEXT, " ");
     }
   gPanelRows = MathMax(gPanelRows, gRow);
   PanelBox(gRow * PNL_ROW_H + 14);
   ChartRedraw();
  }

//+------------------------------------------------------------------+
//| expert events                                                    |
//+------------------------------------------------------------------+
int OnInit()
  {
   ApplyPersonality();
   gReady = false;     // globals survive a re-init when inputs change
   gLastBar = 0;
   gPanelRows = 0;

   hEmaFast = iMA(_Symbol, InpTimeframe, 20, 0, MODE_EMA, PRICE_CLOSE);
   hEmaSlow = iMA(_Symbol, InpTimeframe, 50, 0, MODE_EMA, PRICE_CLOSE);
   hSma     = iMA(_Symbol, InpTimeframe, 50, 0, MODE_SMA, PRICE_CLOSE);
   hRsi     = iRSI(_Symbol, InpTimeframe, 14, PRICE_CLOSE);
   hMacd    = iMACD(_Symbol, InpTimeframe, 12, 26, 9, PRICE_CLOSE);
   hBands   = iBands(_Symbol, InpTimeframe, 20, 0, 2.0, PRICE_CLOSE);
   hAtr     = iATR(_Symbol, InpTimeframe, 14);
   if(hEmaFast == INVALID_HANDLE || hEmaSlow == INVALID_HANDLE || hSma == INVALID_HANDLE ||
      hRsi == INVALID_HANDLE || hMacd == INVALID_HANDLE || hBands == INVALID_HANDLE || hAtr == INVALID_HANDLE)
     {
      Print("EmoTrader: failed to create indicators, error ", GetLastError());
      return INIT_FAILED;
     }

   ArraySetAsSeries(gEmaF, true);  ArraySetAsSeries(gEmaS, true);  ArraySetAsSeries(gSma, true);
   ArraySetAsSeries(gRsi, true);   ArraySetAsSeries(gMacdM, true); ArraySetAsSeries(gMacdS, true);
   ArraySetAsSeries(gBbU, true);   ArraySetAsSeries(gBbL, true);   ArraySetAsSeries(gAtr, true);
   ArraySetAsSeries(gClose, true); ArraySetAsSeries(gVol, true);

   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(50);
   trade.SetTypeFillingBySymbol(_Symbol);

   gEquityPeak = AccountInfoDouble(ACCOUNT_EQUITY);
   gDecision.action = ACT_HOLD;
   gDecision.note = L("منتظر بسته شدن اولین کندل", "Waiting for the first closed bar");
   gDecision.note2 = "";
   CheckNewDay();
   Comment("");
   Print("EmoTrader started on ", _Symbol, " ", EnumToString(InpTimeframe));
   UpdatePanel();
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   ObjectsDeleteAll(0, PNL_PREFIX);
   ChartRedraw();
   IndicatorRelease(hEmaFast); IndicatorRelease(hEmaSlow); IndicatorRelease(hSma);
   IndicatorRelease(hRsi);     IndicatorRelease(hMacd);    IndicatorRelease(hBands);
   IndicatorRelease(hAtr);
  }

void OnTick()
  {
   if(!gReady)
     {
      gReady = Warmup();
      if(!gReady)
        {
         UpdatePanel();
         return;
        }
     }
   datetime bar = iTime(_Symbol, InpTimeframe, 0);
   if(bar != 0 && bar != gLastBar)
     {
      gLastBar = bar;
      OnNewBar();
     }
   UpdatePanel();
  }

void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
  {
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD || !HistoryDealSelect(trans.deal))
      return;
   if(HistoryDealGetInteger(trans.deal, DEAL_MAGIC) != (long)InpMagic || HistoryDealGetString(trans.deal, DEAL_SYMBOL) != _Symbol)
      return;
   long entry = HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
   if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY)
      return;

   double profit = HistoryDealGetDouble(trans.deal, DEAL_PROFIT) + HistoryDealGetDouble(trans.deal, DEAL_SWAP)
                   + HistoryDealGetDouble(trans.deal, DEAL_COMMISSION);
   double risk = (gEntryRisk > 0.0) ? gEntryRisk : AccountInfoDouble(ACCOUNT_EQUITY) * InpRiskPercent / 100.0;
   double r = profit / risk;
   OnTradeClosedEmotion(r);
   gEntryRisk = 0.0;

   long reason = HistoryDealGetInteger(trans.deal, DEAL_REASON);
   string why = L("معامله بسته شد", "Trade closed");
   if(reason == DEAL_REASON_SL)
      why = L("حد ضرر خورد", "Stop loss hit");
   else if(reason == DEAL_REASON_TP)
      why = L("حد سود خورد", "Take profit hit");
   SetEvent(why, StringFormat("%+.2f %s  (%+.2fR)", profit, AccountInfoString(ACCOUNT_CURRENCY), r));
   UpdatePanel();
  }
//+------------------------------------------------------------------+
