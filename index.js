const express = require("express");
const cors = require("cors");  // ← AÑADE ESTA LÍNEA

const app = express();
app.use(cors());  // ← AÑADE ESTA LÍNEA
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Chatbot funcionando 🚀");
});

app.post("/chat", (req, res) => {
  const userMessage = req.body.message;
  res.json({ reply: "Dijiste: " + userMessage });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto " + PORT);
});
