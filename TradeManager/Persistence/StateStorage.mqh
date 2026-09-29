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
