#ifndef TM_CHARTPANEL_MQH
#define TM_CHARTPANEL_MQH

#include "../Utils/TimeUtils.mqh"

#define TM_PANEL_PREFIX "TMP_"
#define TM_PANEL_ROWS   6
#define TM_PANEL_W      340
#define TM_PANEL_H      252
#define TM_PANEL_H_MIN  30

enum ENUM_PANEL_ACTION
{
   PANEL_NONE = 0,
   PANEL_TOGGLE_BE,
   PANEL_TOGGLE_TRAIL,
   PANEL_TOGGLE_PARTIAL,
   PANEL_TOGGLE_PAUSE,
   PANEL_BE_ALL,
   PANEL_CLOSE_HALF,
   PANEL_CLOSE_ALL
};

// Drawing and click handling only. It knows nothing about trading: the engine feeds it
// numbers with Render() and reacts to the action HandleEvent() returns.
class CChartPanel
{
private:
   int    m_x;
   int    m_y;
   bool   m_created;
   bool   m_minimized;
   ulong  m_confirmHalfUntil;
   ulong  m_confirmAllUntil;
   string m_content[];          // objects hidden when the panel is minimized
   string m_rowText[TM_PANEL_ROWS];
   color  m_rowColor[TM_PANEL_ROWS];

   string Name(const string id) const { return TM_PANEL_PREFIX + id; }

   void Track(const string id)
   {
      const int k = ArraySize(m_content);
      ArrayResize(m_content, k + 1);
      m_content[k] = Name(id);
   }

   void Base(const string id, const ENUM_OBJECT type)
   {
      const string n = Name(id);
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
      ObjectSetInteger(0, n, OBJPROP_YDISTANCE, m_y + y);
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
      ObjectSetInteger(0, n, OBJPROP_YDISTANCE, m_y + y);
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
      ObjectSetInteger(0, n, OBJPROP_YDISTANCE, m_y + y);
      ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
      ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
      ObjectSetInteger(0, n, OBJPROP_FONTSIZE, 8);
      ObjectSetString(0, n, OBJPROP_FONT, "Arial");
      ObjectSetString(0, n, OBJPROP_TEXT, text);
      ObjectSetInteger(0, n, OBJPROP_BORDER_COLOR, C'90,90,90');
      ObjectSetInteger(0, n, OBJPROP_STATE, false);
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

   // First click arms the button, a second click within 3 seconds confirms it.
   bool Confirmed(ulong &until)
   {
      const ulong now = TM_NowMs();
      if(now < until)
      {
         until = 0;
         return true;
      }
      until = now + 3000;
      return false;
   }

   void Layout()
   {
      ObjectSetInteger(0, Name("bg"), OBJPROP_YSIZE, m_minimized ? TM_PANEL_H_MIN : TM_PANEL_H);
      ObjectSetString(0, Name("min"), OBJPROP_TEXT, m_minimized ? "+" : "_");
      const long tf = m_minimized ? OBJ_NO_PERIODS : OBJ_ALL_PERIODS;
      for(int i = 0; i < ArraySize(m_content); i++)
         ObjectSetInteger(0, m_content[i], OBJPROP_TIMEFRAMES, tf);
   }

public:
   CChartPanel()
   {
      m_x = 10; m_y = 20; m_created = false; m_minimized = false;
      m_confirmHalfUntil = 0; m_confirmAllUntil = 0;
      for(int i = 0; i < TM_PANEL_ROWS; i++) { m_rowText[i] = ""; m_rowColor[i] = clrSilver; }
   }

   bool Create(const int x, const int y)
   {
      Destroy();
      m_x = x;
      m_y = y;
      ArrayResize(m_content, 0);

      Rect("bg", 0, 0, TM_PANEL_W, TM_PANEL_H, C'24,26,32', C'70,74,84');
      Label("title", 8, 7, "TRADE MANAGER", clrWhite, 9);
      Button("min", TM_PANEL_W - 30, 4, 22, 20, "_");
      SetButton("min", "_", C'55,58,66');

      Label("l1", 8, 32, "", clrSilver, 9);   Track("l1");
      Label("l2", 8, 48, "", clrSilver, 9);   Track("l2");
      Label("l3", 8, 64, "", clrSilver, 9);   Track("l3");

      const int tw = 104;
      Button("be",      8,            88, tw, 22, "");  Track("be");
      Button("trail",   8 + tw + 6,   88, tw, 22, "");  Track("trail");
      Button("partial", 8 + 2*(tw+6), 88, tw, 22, "");  Track("partial");

      const int aw = 76;
      Button("pause",    8,            116, aw, 22, "");  Track("pause");
      Button("beall",    8 + aw + 6,   116, aw, 22, "");  Track("beall");
      Button("half",     8 + 2*(aw+6), 116, aw, 22, "");  Track("half");
      Button("closeall", 8 + 3*(aw+6), 116, aw, 22, "");  Track("closeall");

      for(int i = 0; i < TM_PANEL_ROWS; i++)
      {
         Label("row" + IntegerToString(i), 8, 148 + i * 16, "", clrSilver, 8);
         Track("row" + IntegerToString(i));
      }

      m_created = true;
      Layout();
      return true;
   }

   void Destroy()
   {
      ObjectsDeleteAll(0, TM_PANEL_PREFIX);
      ArrayResize(m_content, 0);
      m_created = false;
   }

   void SetRow(const int index, const string text, const color clr)
   {
      if(index < 0 || index >= TM_PANEL_ROWS)
         return;
      m_rowText[index] = text;
      m_rowColor[index] = clr;
   }

   void Render(const int positions, const double openRisk, const double openRiskPct,
               const double dailyPL, const double dailyPLPct, const double ddPct,
               const string protection, const bool protectionActive,
               const bool beOn, const bool trailOn, const bool partialOn, const bool paused)
   {
      if(!m_created)
         return;

      const color on  = C'28,120,64';
      const color off = C'70,72,80';

      SetText("l1", StringFormat("Positions %d   Open risk %.2f (%.2f%%)", positions, openRisk, openRiskPct), clrSilver);
      SetText("l2", StringFormat("Daily P/L %.2f (%.2f%%)   DD %.2f%%", dailyPL, dailyPLPct, ddPct),
              dailyPL >= 0.0 ? C'110,210,130' : C'235,110,110');
      SetText("l3", "Protection: " + protection + (paused ? "   [PAUSED]" : ""),
              protectionActive ? C'235,110,110' : (paused ? C'240,190,80' : C'110,210,130'));

      SetButton("be",      beOn      ? "BE: ON"      : "BE: OFF",      beOn      ? on : off);
      SetButton("trail",   trailOn   ? "TRAIL: ON"   : "TRAIL: OFF",   trailOn   ? on : off);
      SetButton("partial", partialOn ? "PARTIAL: ON" : "PARTIAL: OFF", partialOn ? on : off);

      const ulong now = TM_NowMs();
      SetButton("pause",    paused ? "RESUME" : "PAUSE", paused ? C'170,120,20' : C'55,58,66');
      SetButton("beall",    "BE ALL", C'40,80,140');
      SetButton("half",     now < m_confirmHalfUntil ? "CONFIRM?" : "CLOSE 50%", now < m_confirmHalfUntil ? C'190,60,60' : C'110,70,40');
      SetButton("closeall", now < m_confirmAllUntil  ? "CONFIRM?" : "CLOSE ALL", now < m_confirmAllUntil  ? C'190,60,60' : C'130,40,40');

      for(int i = 0; i < TM_PANEL_ROWS; i++)
         SetText("row" + IntegerToString(i), m_rowText[i], m_rowColor[i]);

      ChartRedraw();
   }

   // Call from OnChartEvent. Returns the action the engine should perform, if any.
   ENUM_PANEL_ACTION HandleEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
   {
      if(!m_created || id != CHARTEVENT_OBJECT_CLICK || StringFind(sparam, TM_PANEL_PREFIX) != 0)
         return PANEL_NONE;

      ObjectSetInteger(0, sparam, OBJPROP_STATE, false);   // buttons never stay pressed
      const string key = StringSubstr(sparam, StringLen(TM_PANEL_PREFIX));

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
      if(key == "half")     return Confirmed(m_confirmHalfUntil) ? PANEL_CLOSE_HALF : PANEL_NONE;
      if(key == "closeall") return Confirmed(m_confirmAllUntil)  ? PANEL_CLOSE_ALL  : PANEL_NONE;
      return PANEL_NONE;
   }
};

#endif
