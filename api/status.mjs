export default function handler(req, res) {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ extract: !!process.env.GEMINI_API_KEY, send: !!process.env.RESEND_API_KEY }));
}
