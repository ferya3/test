#ifndef TM_CHARTPANEL_MQH
#define TM_CHARTPANEL_MQH

#include "../Utils/TimeUtils.mqh"
#include "../Utils/Logger.mqh"

#define TM_PANEL_PREFIX "TMP_"
#define TM_PANEL_ROWS   6
#define TM_PANEL_W      440
#define TM_PANEL_H      296
#define TM_PANEL_H_MIN  30
#define TM_PANEL_ROW_Y  166
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

   void Edit(const string id, const int x, const int y, const int w, const int h)
   {
      Base(id, OBJ_EDIT);
      const string n = Name(id);
      ObjectSetInteger(0, n, OBJPROP_XDISTANCE, m_x + x);
      ObjectSetInteger(0, n, OBJPROP_YDISTANCE, m_y + y);
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
      ObjectSetInteger(0, Name("bg"), OBJPROP_YSIZE, m_minimized ? TM_PANEL_H_MIN : TM_PANEL_H);
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

public:
   CChartPanel()
   {
      m_x = 10; m_y = 20; m_created = false; m_minimized = false;
      m_pendingRow = -1;
      for(int i = 0; i < TM_PANEL_ROWS; i++)
      {
         m_rowText[i] = ""; m_rowColor[i] = clrSilver; m_rowTicket[i] = 0;
         m_rowSL[i] = 0.0; m_rowTP[i] = 0.0; m_rowDigits[i] = 5; m_rowDirty[i] = false;
      }
   }

   bool Create(const int x, const int y)
   {
      Destroy();
      m_x = x;
      m_y = y;
      ArrayResize(m_content, 0);

      Rect("bg", 0, 0, TM_PANEL_W, TM_PANEL_H, C'24,26,32', C'70,74,84');
      Label("title", 8, 7, "TRADE MANAGER  v1.4", clrWhite, 9);
      Button("min", TM_PANEL_W - 30, 4, 22, 20, "_");
      SetButton("min", "_", C'55,58,66');

      Label("l1", 8, 32, "", clrSilver, 9);   Track("l1");
      Label("l2", 8, 48, "", clrSilver, 9);   Track("l2");
      Label("l3", 8, 64, "", clrSilver, 9);   Track("l3");

      const int tw = 137;
      Button("be",      8,            88, tw, 22, "");  Track("be");
      Button("trail",   8 + tw + 6,   88, tw, 22, "");  Track("trail");
      Button("partial", 8 + 2*(tw+6), 88, tw, 22, "");  Track("partial");

      const int aw = 101;
      Button("pause",    8,            116, aw, 22, "");  Track("pause");
      Button("beall",    8 + aw + 6,   116, aw, 22, "");  Track("beall");
      Button("half",     8 + 2*(aw+6), 116, aw, 22, "");  Track("half");
      Button("closeall", 8 + 3*(aw+6), 116, aw, 22, "");  Track("closeall");

      Label("hdr",  8,   148, "POSITION", C'150,155,165', 8);   Track("hdr");
      Label("hsl", 222,  148, "SL", C'150,155,165', 8);   Track("hsl");
      Label("htp", 328,  148, "TP   (Enter = apply, 0 = none)", C'150,155,165', 8);   Track("htp");

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
      ObjectsDeleteAll(0, TM_PANEL_PREFIX);
      ArrayResize(m_content, 0);
      m_created = false;
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
