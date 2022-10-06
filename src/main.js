import express from "express";
import { Server as HttpServer } from "http";
import { Server as Socket } from "socket.io";
import ContenedorSQL from "./contenedores/ContenedorSQL.js";
import config from "./config.js";
import * as fakeProdApi from "./api/fakeProds.js";
import MongoDbContainer from "./contenedores/ContenedorMongoDB.js";
import * as msgsConfig from "./config/msgs.js";
import * as msgNormalizer from "./utils/normalizer.js";
import session from "express-session";
import MongoStore from "connect-mongo";

//--------------------------------------------
// instancio servidor, socket y api

const app = express();
const httpServer = new HttpServer(app);
const io = new Socket(httpServer);

const productosApi = new ContenedorSQL(config.mariaDb, "productos");
const mensajesApi = new MongoDbContainer(
  msgsConfig.msgsCollection,
  msgsConfig.msgsSchema
);

//--------------------------------------------
// configuro el socket

const processMsgData = (msgData) => {
  const plainMsgs = msgData.map((msg) => {
    const dateTime = new Date(parseInt(msg.id.substring(0, 8), 16) * 1000);
    delete msg.author["_id"];
    delete msg["__v"];
    msg = { ...msg, dateTime };
    return msg;
  });
  const originalData = { id: "mensajes", mensajes: plainMsgs };
  return msgNormalizer.getNormalized(originalData);
};
import util from "util";
io.on("connection", async (socket) => {
  // apenas se genera la conexión tengo que cargar mensajes y productos
  const productos = await productosApi.listarAll();
  io.sockets.emit("productos", productos);
  const msgData = await mensajesApi.getAll();
  const mensajes = processMsgData(msgData);
  io.sockets.emit("mensajes", mensajes);

  console.log("Nueva conexion");
  // cuando llega un producto nuevo grabo, obtengo data, hago emit
  socket.on("newProduct", async (data) => {
    await productosApi.guardar(data);
    const productos = await productosApi.listarAll();
    io.sockets.emit("productos", productos);
  });

  // cuando llega un producto nuevo grabo, obtengo data, hago emit
  socket.on("newMessage", async (data) => {
    await mensajesApi.createNew(data);
    const msgData = await mensajesApi.getAll();
    const mensajes = processMsgData(msgData);
    io.sockets.emit("mensajes", mensajes);
  });
});

//--------------------------------------------
// agrego middlewares

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// setteo sesiones
const sessionStore = MongoStore.create({
  mongoUrl:
    "mongodb+srv://roque:asd123@cluster0.elrkf.mongodb.net/?retryWrites=true&w=majority",
  ttl: 60,
});

app.use(
  session({
    store: sessionStore,
    secret: "sessionSecret",
    resave: false,
    saveUninitialized: false,
  })
);

//Set engine
app.set("views", "./views");
app.set("view engine", "ejs");

// ### MIDDLEWARES de login

const isLoggedIn = (req, res, next) => {
  if (!req.session.nombre) return res.redirect("/login");
  next();
};

const isLoggedOut = (req, res, next) => {
  if (req.session.nombre) return res.redirect("/");
  next();
};

// rutas

app.get("/login", isLoggedOut, (req, res) => {
  res.render("login");
});

app.post("/login", isLoggedOut, (req, res) => {
  if (req.body.nombre) {
    req.session.nombre = req.body.nombre;
    res.redirect("/");
  } else {
    res.redirect("/login");
  }
});

app.get("/", isLoggedIn, (req, res) => {
  res.render("index", { nombre: req.session.nombre });
});

app.get("/api/productos-test", (req, res) => {
  const fakeProds = fakeProdApi.generateMany(5);
  res.send(fakeProds);
});


app.get("/logout", isLoggedIn, (req, res) => {
  
  const nombre = req.session.nombre;
  req.session.destroy((err) => {
    if (err) {
      res.json({ status: "Logout Error", body: err });
    } else {
      
      res.render("logout", { nombre: nombre });
    }
  });
});

//--------------------------------------------
// inicio el servidor

const PORT = 8080;
const connectedServer = httpServer.listen(PORT, () => {
  console.log(
    `Servidor http escuchando en el puerto ${connectedServer.address().port}`
  );
});
connectedServer.on("error", (error) =>
  console.log(`Error en servidor ${error}`)
);