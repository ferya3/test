const BG_IMAGE = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=2400&q=80";

const html = `<!DOCTYPE html>
<html lang="fa">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Coming Soon</title>
<style>
  html, body {
    margin: 0;
    padding: 0;
    height: 100%;
    background: #000;
  }
  body {
    background-image: url("${BG_IMAGE}");
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    background-attachment: fixed;
  }
</style>
</head>
<body></body>
</html>`;

export default {
  fetch() {
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    });
  },
};
