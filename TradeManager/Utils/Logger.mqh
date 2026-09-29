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
