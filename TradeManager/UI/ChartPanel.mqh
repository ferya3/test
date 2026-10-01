#ifndef TM_CHARTPANEL_MQH
#define TM_CHARTPANEL_MQH

#include "../Utils/TimeUtils.mqh"
#include "../Utils/Logger.mqh"
#include "../Utils/SessionClock.mqh"

#define TM_PANEL_PREFIX "TMP_"
#define TM_PANEL_ROWS   6
#define TM_PANEL_W      440
#define TM_PANEL_H      440
#define TM_PANEL_H_MIN  30
#define TM_PANEL_PRICE_H 56          // big price strip under the title bar
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
      Label("title", 8, 7, "TRADE MANAGER  v1.9   (drag this bar to move)", clrWhite, 9);
      Button("min", TM_PANEL_W - 30, 4, 22, 20, "_");
      SetButton("min", "_", C'55,58,66');

      // Big live price. Not tracked, so it stays visible when the panel is minimized.
      Label("pcap1", 8,   32, "", C'150,155,165', 9);
      Label("pcap2", 224, 32, "", C'150,155,165', 9);
      Label("pbid",  8,   46, "", clrWhite, m_priceFont);
      Label("pask",  224, 46, "", clrWhite, m_priceFont);
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
