const express = require("express");
const app = express.Router();
const path = require("path");

app.customPath = "/";

const filesPath = path.join(__dirname, "../../files");

app.get("/", (req, res) => {
  res.redirect("/login");
});

app.get("/login", (req, res) => {
  console.log("Route hit: /loginPage");
  res.clearCookie("auth");
  res.sendFile(path.join(filesPath, "LoginPage.html"));
});

app.get("/register", (req, res) => {
  res.redirect("/login");
});

app.get("/faqs", (req, res) => {
  res.redirect("/login");
});

app.get("/store", (req, res) => {
  res.redirect("/login");
});

app.get("/product", (req, res) => {
  res.redirect("/login");
});

module.exports = app;
