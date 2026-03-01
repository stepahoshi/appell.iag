const path = require('path');
const express = require('express');
const multer = require('multer');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
    cb(null, !!ok);
  },
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const SYSTEM_PROMPT = `Ты помощник сервиса Appell. Пользователь загружает скриншоты или кадры из видео (игры, стримы, таблицы лидеров и т.д.).
Твоя задача: найти на изображении все никнеймы (имена игроков, логины, ники) и вывести их списком.
Отвечай кратко. В конце ответа обязательно добавь блок в формате:
NICKNAMES_JSON: ["ник1", "ник2", "ник3"]
Список в NICKNAMES_JSON должен содержать только извлечённые никнеймы, без пояснений. Если ников нет — укажи пустой массив: [].`;

function extractNicknamesFromReply(reply) {
  const match = reply.match(/NICKNAMES_JSON:\s*(\[[\s\S]*?\])/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[1]);
    return Array.isArray(arr) ? arr.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

function cleanReply(reply) {
  return reply.replace(/\s*NICKNAMES_JSON:\s*\[[\s\S]*?\].*$/s, '').trim();
}

app.post('/api/analyze', upload.array('images', 6), async (req, res) => {
  const message = (req.body && req.body.message) || 'Найди и выведи список никнеймов игроков с этого изображения.';
  const files = req.files || [];

  if (!openai) {
    return res.status(503).json({
      error: 'Сервис не настроен. Укажи OPENAI_API_KEY в переменных окружения.',
    });
  }

  const imageParts = [];
  for (const file of files) {
    if (!file.buffer || !file.mimetype.startsWith('image/')) continue;
    imageParts.push({
      type: 'image_url',
      image_url: {
        url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
      },
    });
  }

  const content = [
    { type: 'text', text: message },
    ...imageParts,
  ];

  if (imageParts.length === 0 && !message.trim()) {
    return res.status(400).json({ error: 'Нужно сообщение или хотя бы одно изображение.' });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      max_tokens: 800,
    });

    const reply = completion.choices[0]?.message?.content || 'Ничего не найдено.';
    const nicknames = extractNicknamesFromReply(reply);
    const cleanText = cleanReply(reply);

    res.json({
      reply: cleanText || (nicknames.length ? 'Найденные ники указаны в списке ниже.' : 'Никнеймы не обнаружены.'),
      nicknames,
    });
  } catch (err) {
    console.error(err);
    const msg = err.message || 'Ошибка при обращении к нейросети.';
    res.status(500).json({ error: msg });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Appell: http://localhost:${PORT}`);
  if (!openai) console.warn('OPENAI_API_KEY не задан — анализ изображений работать не будет.');
});
