#ifndef TM_PRICEALARMS_MQH
#define TM_PRICEALARMS_MQH

#include "../Utils/Logger.mqh"

#define TM_ALARM_PREFIX "TMA_"

// Each alarm is a horizontal line on the chart, so it can be dragged to a new price or deleted
// by hand, and it survives a timeframe change or a terminal restart along with the chart.
// A line fires once, when the Bid crosses it in either direction, and is then removed.
class CPriceAlarms
{
private:
   bool   m_popup;
   bool   m_push;
   string m_sound;
   color  m_color;
   double m_prevBid;

   void Notify(const string text)
   {
      Logger.Info("Alarm", text);
      if(m_popup)
         Alert("Trade Manager: ", text);
      if(m_sound != "")
         PlaySound(m_sound);
      if(m_push && !SendNotification("Trade Manager: " + text))
         Logger.Warn("Alarm", StringFormat("push notification failed (error %d); check Tools > Options > Notifications", GetLastError()));
   }

public:
   CPriceAlarms()
   {
      m_popup = true; m_push = false; m_sound = ""; m_color = clrOrange; m_prevBid = 0.0;
   }

   void Configure(const bool popup, const string sound, const bool push, const color clr)
   {
      m_popup = popup;
      m_sound = sound;
      m_push  = push;
      m_color = clr;
   }

   bool Add(const double price, const int digits)
   {
      if(price <= 0.0)
         return false;
      const string n = TM_ALARM_PREFIX + IntegerToString((long)GetMicrosecondCount());
      if(!ObjectCreate(0, n, OBJ_HLINE, 0, 0, NormalizeDouble(price, digits)))
         return false;
      ObjectSetInteger(0, n, OBJPROP_COLOR, m_color);
      ObjectSetInteger(0, n, OBJPROP_STYLE, STYLE_DASH);
      ObjectSetInteger(0, n, OBJPROP_WIDTH, 1);
      ObjectSetInteger(0, n, OBJPROP_SELECTABLE, true);   // drag to move, Delete to cancel
      ObjectSetInteger(0, n, OBJPROP_HIDDEN, false);       // listed in the chart's object list
      ObjectSetString(0, n, OBJPROP_TEXT, "TM alarm");
      ObjectSetString(0, n, OBJPROP_TOOLTIP, "Price alarm: drag to move, delete to cancel");
      ChartRedraw();
      return true;
   }

   int Count() const
   {
      int n = 0;
      for(int i = ObjectsTotal(0, 0, OBJ_HLINE) - 1; i >= 0; i--)
         if(StringFind(ObjectName(0, i, 0, OBJ_HLINE), TM_ALARM_PREFIX) == 0)
            n++;
      return n;
   }

   int Clear()
   {
      const int n = ObjectsDeleteAll(0, TM_ALARM_PREFIX);
      ChartRedraw();
      return n;
   }

   // Compares the Bid with the one seen on the previous call, so a line dragged across the
   // price does not fire; only the price moving through the line does.
   // Returns how many alarms fired; text describes the last one.
   int Check(const string symbol, const double bid, const int digits, string &text)
   {
      const double prev = m_prevBid;
      m_prevBid = bid;
      if(prev <= 0.0 || bid <= 0.0 || bid == prev)
         return 0;

      int fired = 0;
      for(int i = ObjectsTotal(0, 0, OBJ_HLINE) - 1; i >= 0; i--)   // backwards: lines are deleted as they fire
      {
         const string n = ObjectName(0, i, 0, OBJ_HLINE);
         if(StringFind(n, TM_ALARM_PREFIX) != 0)
            continue;
         const double level = ObjectGetDouble(0, n, OBJPROP_PRICE);
         const bool up   = (prev < level && bid >= level);
         const bool down = (prev > level && bid <= level);
         if(!up && !down)
            continue;
         ObjectDelete(0, n);
         text = StringFormat("ALARM %s %s %s (Bid %s)", symbol, up ? "rose to" : "fell to",
                             DoubleToString(level, digits), DoubleToString(bid, digits));
         Notify(text);
         fired++;
      }
      if(fired > 0)
         ChartRedraw();
      return fired;
   }
};

#endif
