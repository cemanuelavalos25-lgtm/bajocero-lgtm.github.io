"use strict";
/*
  ============================================================
  BAJO CERO · interacciones.js
  ------------------------------------------------------------
  Este archivo es el "cerebro" del Punto de Venta: aquí vive
  toda la lógica (login, carrito, cálculos, generación de
  comprobantes, exportación e historial). El HTML solo define
  la estructura vacía; este script es quien la llena de datos
  y reacciona a lo que hace el usuario.

  "use strict" activa el modo estricto de JavaScript: hace que
  errores comunes (como usar una variable sin declararla) lancen
  un error visible en vez de fallar en silencio.
  ============================================================
*/

/* ============================================================
   1. DATOS BASE DE LA TIENDA Y PERSISTENCIA (localStorage)
   ------------------------------------------------------------
   localStorage es un espacio de almacenamiento que el navegador
   guarda en el equipo del usuario y que sobrevive aunque se
   cierre la pestaña o el navegador. Solo puede guardar TEXTO,
   por eso los objetos se convierten con JSON.stringify() antes
   de guardarlos, y se reconstruyen con JSON.parse() al leerlos.
============================================================ */

// Nombres de las "llaves" (keys) bajo las que se guarda cada cosa en localStorage
const LS_USERS   = "bajocero_pos_users";   // lista de usuarios registrados
const LS_SESSION = "bajocero_pos_session"; // usuario con sesión activa en este momento
const LS_SALES   = "bajocero_pos_ventas";  // historial de tickets generados
const LS_THEME   = "bajocero_pos_theme";   // preferencia de tema claro/oscuro
const LS_STOCK   = "bajocero_pos_stock";   // inventario actual de cada producto

// Catálogo de productos de la heladería.
// Es un arreglo de objetos: cada producto tiene id (identificador único),
// name (nombre visible), cat (categoría, para agrupar visualmente), price (precio)
// y stock (inventario inicial disponible).
const PRODUCTS = [
  { id:"c1",  name:"Cono 1 bola",          cat:"Conos",   price:1.50, stock:20 },
  { id:"c2",  name:"Cono 2 bolas",         cat:"Conos",   price:2.25, stock:20 },
  { id:"c3",  name:"Cono 3 bolas",         cat:"Conos",   price:3.00, stock:15 },
  { id:"v1",  name:"Vasito 1 bola",        cat:"Vasitos", price:1.35, stock:20 },
  { id:"v2",  name:"Vasito 2 bolas",       cat:"Vasitos", price:2.10, stock:20 },
  { id:"cp3", name:"Copa 3 bolas",         cat:"Copas",   price:3.75, stock:10 },
  { id:"bs",  name:"Banana Split",         cat:"Copas",   price:4.50, stock:8  },
  { id:"waf", name:"Waffle con helado",    cat:"Copas",   price:4.25, stock:10 },
  { id:"malt",name:"Malteada",             cat:"Bebidas", price:3.25, stock:15 },
  { id:"frap",name:"Frappé",               cat:"Bebidas", price:3.50, stock:15 },
  { id:"pal", name:"Paleta de chocolate",  cat:"Paletas", price:1.25, stock:25 },
  { id:"top", name:"Topping extra",        cat:"Extras",  price:0.50, stock:50 },
];

// Crea un usuario "admin" por defecto la PRIMERA VEZ que se abre la app
// (si ya existe la llave LS_USERS en localStorage, no hace nada).
const seedUsers = () => {
  // Sin usuario por defecto: el primer acceso debe hacerse
  // desde el formulario de registro.
};

// Funciones auxiliares para leer/escribir usuarios, ventas y stock.
// El " || '[]' " (o " || '{}' ") es un valor por defecto: si todavía
// no existe nada guardado, se comporta como si hubiera un arreglo/objeto vacío.
const getUsers  = () => JSON.parse(localStorage.getItem(LS_USERS) || "[]");
const saveUsers = (u) => localStorage.setItem(LS_USERS, JSON.stringify(u));
const getSales  = () => JSON.parse(localStorage.getItem(LS_SALES) || "[]");
const saveSales = (s) => localStorage.setItem(LS_SALES, JSON.stringify(s));
const getStock  = () => JSON.parse(localStorage.getItem(LS_STOCK) || "{}");
const saveStock = (s) => localStorage.setItem(LS_STOCK, JSON.stringify(s));

// Crea el inventario inicial la PRIMERA VEZ que se abre la app,
// tomando el "stock" definido en cada producto de PRODUCTS.
// Si ya existe stock guardado de una visita anterior, no lo pisa.
function initStock(){
  if (!localStorage.getItem(LS_STOCK)){
    const inicial = {};
    PRODUCTS.forEach(p => inicial[p.id] = p.stock);
    saveStock(inicial);
  }
}

seedUsers(); // se ejecuta apenas se carga el script
initStock(); // crea el inventario inicial si aún no existe

/* ============================================================
   2. UTILIDADES GENERALES
============================================================ */

// Atajos para no escribir document.querySelector / querySelectorAll
// todo el tiempo. $ devuelve UN elemento, $$ devuelve una lista.
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Da formato de dinero: 2.5 -> "$2.50"
const money = (n) => "$" + n.toFixed(2);

// ---- Notificación flotante (toast) ----
let toastTimer = null;
function showToast(msg){
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");           // el CSS hace la animación de aparecer
  clearTimeout(toastTimer);          // si ya había un toast por desaparecer, cancela ese temporizador
  toastTimer = setTimeout(()=> t.classList.remove("show"), 2600); // se oculta solo tras 2.6s
}

// Agrega la clase "touched" a un campo cuando el usuario lo tocó
// (blur = salió del campo, input = escribió algo). Esto es lo que
// activa los mensajes de error en rojo definidos en el CSS, evitando
// que se vean en rojo ANTES de que el usuario haya interactuado.
function attachValidationUX(form){
  form.querySelectorAll("input, select, textarea").forEach(el=>{
    el.addEventListener("blur", ()=> el.classList.add("touched"));
    el.addEventListener("input", ()=> el.classList.add("touched"));
  });
}

/* ============================================================
   3. TEMA CLARO / OSCURO
   ------------------------------------------------------------
   No se cambia ningún color directamente: solo se le pone o
   quita el atributo data-theme="dark" a la etiqueta <html>.
   El CSS ya tiene reglas [data-theme="dark"]{...} que redefinen
   las variables de color; por eso todo el sitio cambia de golpe.
============================================================ */
const applyTheme = (mode) => {
  document.documentElement.setAttribute("data-theme", mode);
  localStorage.setItem(LS_THEME, mode); // recuerda la preferencia para la próxima vez
};

// Al cargar la página, aplica el tema guardado o "light" si es la primera vez
applyTheme(localStorage.getItem(LS_THEME) || "light");

// Al hacer clic en el botón de modo, alterna entre "dark" y "light"
$("#theme-toggle").addEventListener("click", ()=>{
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "dark" ? "light" : "dark");
});

/* ============================================================
   4. LOGIN / REGISTRO
============================================================ */

// Referencias a los contenedores principales que se muestran/ocultan
const loginWrap     = $("#login-wrap");
const appWrap        = $("#app-wrap");
const loginPanel     = $("#login-panel");
const registerPanel  = $("#register-panel");

// Enlaces "¿No tienes cuenta? / ¿Ya tienes cuenta?": alternan qué panel se ve
$("#go-register").addEventListener("click", ()=>{ loginPanel.classList.add("hidden"); registerPanel.classList.remove("hidden"); });
$("#go-login").addEventListener("click", ()=>{ registerPanel.classList.add("hidden"); loginPanel.classList.remove("hidden"); });

// Activa el resaltado de errores en ambos formularios de acceso
attachValidationUX($("#login-form"));
attachValidationUX($("#register-form"));

// Se ejecuta cuando el login fue exitoso:
// guarda la sesión, oculta el login, muestra el POS y pinta el nombre del cajero.
function enterApp(user){
  localStorage.setItem(LS_SESSION, JSON.stringify(user));
  loginWrap.style.display = "none";
  appWrap.style.display = "block";
  $("#user-chip").classList.remove("hidden");
  $("#logout-btn").classList.remove("hidden");
  $("#user-name-label").textContent = user.nombre || user.usuario;
  renderHistory(); // pinta el historial de ventas guardado (si lo hay)
}

// ---- Envío del formulario de LOGIN ----
$("#login-form").addEventListener("submit", (e)=>{
  e.preventDefault(); // evita que el navegador recargue la página (comportamiento por defecto de un <form>)
  const form = e.target;

  // Marca todos los inputs como "touched" para que, si algo está mal,
  // se muestre el error inmediatamente al intentar enviar.
  form.querySelectorAll("input").forEach(i=>i.classList.add("touched"));

  // checkValidity() es un método NATIVO del formulario: revisa que
  // todos los required/minlength/pattern se cumplan. Si no, se detiene aquí.
  if (!form.checkValidity()){ return; }

  const usuario = $("#login-user").value.trim();   // trim() quita espacios sobrantes al inicio/final
  const password = $("#login-pass").value;
  const users = getUsers();

  // Busca, entre los usuarios guardados, uno cuyo usuario y contraseña coincidan
  // (toLowerCase evita que "Admin" y "admin" se traten como usuarios distintos)
  const found = users.find(u => u.usuario.toLowerCase() === usuario.toLowerCase() && u.password === password);

  const errBox = $("#login-error");
  if (!found){
    errBox.textContent = "Usuario o contraseña incorrectos.";
    errBox.classList.remove("hidden");
    return;
  }
  errBox.classList.add("hidden");
  enterApp(found);
});

// ---- Envío del formulario de REGISTRO ----
$("#register-form").addEventListener("submit", (e)=>{
  e.preventDefault();
  const form = e.target;
  form.querySelectorAll("input").forEach(i=>i.classList.add("touched"));
  const errBox = $("#register-error");

  if (!form.checkValidity()){ return; }

  const nombre = $("#reg-name").value.trim();
  const usuario = $("#reg-user").value.trim();
  const pass = $("#reg-pass").value;
  const pass2 = $("#reg-pass2").value;

  // HTML no puede comparar dos campos entre sí, así que esa validación se hace aquí:
  if (pass !== pass2){
    errBox.textContent = "Las contraseñas no coinciden.";
    errBox.classList.remove("hidden");
    $("#reg-pass2").classList.add("touched");
    return;
  }

  const users = getUsers();
  // Evita registrar dos veces el mismo nombre de usuario
  if (users.some(u => u.usuario.toLowerCase() === usuario.toLowerCase())){
    errBox.textContent = "Ese nombre de usuario ya existe.";
    errBox.classList.remove("hidden");
    return;
  }

  const newUser = { nombre, usuario, password: pass };
  users.push(newUser);
  saveUsers(users);
  errBox.classList.add("hidden");

  // En vez de entrar directo, regresa al panel de login
  form.reset();
  form.querySelectorAll("input").forEach(i=>i.classList.remove("touched"));
  registerPanel.classList.add("hidden");
  loginPanel.classList.remove("hidden");
  $("#login-user").value = usuario; // deja el usuario recién creado ya escrito, como cortesía

  showToast("Cuenta creada. Ahora inicia sesión.");
});

// ---- Cerrar sesión ----
$("#logout-btn").addEventListener("click", ()=>{
  localStorage.removeItem(LS_SESSION); // borra solo la sesión activa (los usuarios y ventas quedan intactos)
  location.reload();                    // recarga la página, lo que vuelve a mostrar el login
});

/* ============================================================
   5. VITRINA DE PRODUCTOS + CARRITO (con control de STOCK)
============================================================ */

// El carrito es un arreglo de objetos con esta forma: { id, name, price, qty }
let cart = [];

// Dibuja la vitrina de productos (columna izquierda) y llena el <select>
// del formulario "agregar producto". Se llama cada vez que el stock cambia,
// para que la cantidad disponible se vea siempre actualizada.
function renderMenu(){
  const list = $("#menu-list");
  const select = $("#product-select");
  const stock = getStock(); // inventario actual, leído de localStorage
  list.innerHTML = "";      // limpia el contenido anterior antes de redibujar
  select.innerHTML = "";

  PRODUCTS.forEach(p=>{
    const disponible = stock[p.id] ?? 0; // si no hay dato guardado, asume 0
    const agotado = disponible <= 0;

    // Crea la tarjetita de producto con nombre, categoría, stock, precio y botón
    const row = document.createElement("div");
    row.className = "menu-item";
    row.innerHTML = `
      <div>
        <div class="mi-name">${p.name}</div>
        <div class="mi-cat">${p.cat} · Stock: ${disponible}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="mi-price">${money(p.price)}</span>
        <button type="button" data-id="${p.id}" ${agotado ? "disabled" : ""}>
          ${agotado ? "Agotado" : "Agregar"}
        </button>
      </div>`;
    // Al hacer clic en "Agregar" de esa tarjeta, se agrega 1 unidad de ese producto
    row.querySelector("button").addEventListener("click", ()=> addToCart(p.id, 1));
    list.appendChild(row);

    // Además, agrega una <option> al <select> del formulario de cantidad personalizada
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} — ${money(p.price)}${agotado ? " (agotado)" : ""}`;
    opt.disabled = agotado; // también se deshabilita esa opción en el <select>
    select.appendChild(opt);
  });
}

// Agrega "qty" unidades del producto "id" al carrito, respetando el stock disponible.
function addToCart(id, qty){
  const product = PRODUCTS.find(p=>p.id === id); // busca el producto en el catálogo
  if (!product || qty < 1) return; // seguridad: si no existe o la cantidad es inválida, no hace nada

  const stock = getStock();
  const disponible = stock[id] ?? 0;
  const existing = cart.find(c=>c.id === id);
  const yaEnCarrito = existing ? existing.qty : 0;

  // No permite agregar más unidades de las que hay en inventario,
  // sumando lo que ya estaba en el carrito más lo que se quiere agregar ahora.
  if (yaEnCarrito + qty > disponible){
    showToast(`Solo hay ${disponible} unidades disponibles de ${product.name}.`);
    return;
  }

  if (existing){
    existing.qty += qty; // si ya estaba en el carrito, solo le suma cantidad
  } else {
    cart.push({ id: product.id, name: product.name, price: product.price, qty }); // si no, lo agrega nuevo
  }
  renderCart();
  showToast(`${product.name} agregado (x${qty})`);
}

// Quita por completo un producto del carrito (botón ✕ de cada fila)
function removeFromCart(id){
  cart = cart.filter(c=>c.id !== id); // filter() devuelve un arreglo nuevo sin ese producto
  renderCart();
}

// Redibuja la tabla del carrito según el estado actual del arreglo "cart"
function renderCart(){
  const body = $("#cart-body");
  body.innerHTML = "";

  if (cart.length === 0){
    // Estado vacío: se muestra el mensaje "Aún no has agregado productos"
    body.innerHTML = `<tr class="empty-row"><td colspan="5">Aún no has agregado productos.</td></tr>`;
  } else {
    cart.forEach(item=>{
      const sub = item.price * item.qty; // subtotal de esa línea
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${item.name}</td>
        <td class="num">${item.qty}</td>
        <td class="num">${money(item.price)}</td>
        <td class="num">${money(sub)}</td>
        <td><button class="row-del" data-id="${item.id}" type="button">✕</button></td>`;
      tr.querySelector(".row-del").addEventListener("click", ()=> removeFromCart(item.id));
      body.appendChild(tr);
    });
  }
  calculateTotals(); // cada vez que el carrito cambia, se vuelven a calcular los totales
}

/* ============================================================
   6. CÁLCULOS AUTOMÁTICOS (subtotal, descuento, IVA, total)
============================================================ */
const IVA_RATE = 0.13; // 13%, tasa de IVA de El Salvador

function calculateTotals(){
  // reduce() recorre todo el carrito y va acumulando un solo valor:
  // aquí, la suma de (precio x cantidad) de cada producto.
  const subtotal = cart.reduce((acc, c)=> acc + c.price * c.qty, 0);

  // Lee el % de descuento del input, y lo "recorta" para que quede entre 0 y 50
  // (Math.max evita negativos, Math.min evita más de 50%)
  const discountPct = Math.min(50, Math.max(0, Number($("#discount-input").value) || 0));
  const discountAmt = subtotal * (discountPct / 100);

  const taxedBase = subtotal - discountAmt;      // base sobre la que se calcula el IVA
  const applyIva = $("#iva-check").checked;       // true/false según el checkbox
  const ivaAmt = applyIva ? taxedBase * IVA_RATE : 0;
  const total = taxedBase + ivaAmt;

  // Actualiza el texto de cada "casilla" de totales en pantalla
  $("#t-subtotal").textContent = money(subtotal);
  $("#t-discount").textContent = "-" + money(discountAmt);
  $("#t-iva").textContent = money(ivaAmt);
  $("#t-total").textContent = money(total);

  // Devuelve todos los valores calculados, para que otras funciones
  // (como la de generar el ticket) los puedan reutilizar sin recalcular
  return { subtotal, discountPct, discountAmt, ivaAmt, applyIva, total };
}

// Los totales se recalculan SOLOS cada vez que cambia el descuento o el checkbox de IVA
$("#discount-input").addEventListener("input", calculateTotals);
$("#iva-check").addEventListener("change", calculateTotals);

/* ============================================================
   7. FORMULARIOS: agregar producto / datos del cliente
============================================================ */
attachValidationUX($("#add-item-form"));
attachValidationUX($("#customer-form"));

// Formulario "Producto + Cantidad" -> agrega al carrito
$("#add-item-form").addEventListener("submit", (e)=>{
  e.preventDefault(); // no recargar la página
  const id = $("#product-select").value;
  const qty = Number($("#qty-input").value); // convierte el texto del input a número
  if (!id || !qty || qty < 1) return;
  addToCart(id, qty);
  $("#qty-input").value = 1; // resetea la cantidad a 1 para la siguiente vez
});

/* ============================================================
   8. GENERAR COMPROBANTE (ticket) — aquí se descuenta el stock
============================================================ */
let lastTicket = null; // guarda el último ticket generado (lo usan imprimir/PDF/Excel)

$("#customer-form").addEventListener("submit", (e)=>{
  e.preventDefault();
  const form = e.target;
  form.querySelectorAll("input").forEach(i=>i.classList.add("touched"));

  // No se puede generar un comprobante sin productos en el carrito
  if (cart.length === 0){
    showToast("Agrega al menos un producto antes de generar el comprobante.");
    return;
  }
  if (!form.checkValidity()){ return; } // valida nombre, teléfono, correo, etc.

  const totals = calculateTotals();
  const session = JSON.parse(localStorage.getItem(LS_SESSION) || "{}");

  // Arma el objeto completo del ticket con toda la información de la venta
  lastTicket = {
    id: "T-" + Date.now(),                     // Date.now() da un número único (milisegundos actuales)
    fecha: new Date().toLocaleString("es-SV"), // fecha/hora con formato de El Salvador
    cajero: session.nombre || session.usuario || "—",
    cliente: {
      nombre: $("#cust-name").value.trim(),
      telefono: $("#cust-phone").value.trim(),
      correo: $("#cust-email").value.trim(),
      pago: $("#pay-method").value,
      notas: $("#notes").value.trim(),
    },
    items: cart.map(c=>({...c})), // copia cada producto (para no compartir referencia con "cart")
    ...totals,                     // agrega subtotal, descuento, iva y total ya calculados
  };

  decreaseStock(lastTicket.items); // resta del inventario lo vendido en este ticket
  renderTicket(lastTicket);        // dibuja el recibo en pantalla
  persistSale();                   // lo guarda en el historial (localStorage)
  renderHistory();                 // refresca la lista de historial visible
  renderMenu();                    // refresca la vitrina para mostrar el stock actualizado
  $("#ticket-panel").style.display = "block";
  $("#ticket-panel").scrollIntoView({ behavior:"smooth", block:"start" }); // baja la vista hasta el ticket
  showToast("Comprobante generado.");
});

// Resta del inventario las cantidades vendidas en un ticket.
// Math.max(0, ...) evita que el stock quede en números negativos.
function decreaseStock(items){
  const stock = getStock();
  items.forEach(it=>{
    stock[it.id] = Math.max(0, (stock[it.id] ?? 0) - it.qty);
  });
  saveStock(stock);
}

// Construye el HTML visual del recibo a partir de un objeto "ticket"
function renderTicket(t){
  const area = $("#ticket-area");

  // Genera una fila de tabla por cada producto (usando .map + .join para unir todo en un solo string)
  const rows = t.items.map(it => `
    <tr>
      <td>${it.name} x${it.qty}</td>
      <td class="num">${money(it.price * it.qty)}</td>
    </tr>`).join("");

  // Los backticks ( ` ` ) permiten escribir HTML "armado" con variables insertadas
  // usando ${...} — esto se llama "template literal".
  area.innerHTML = `
    <div class="ticket">
      <h3>🍦 Bajo Cero Heladería</h3>
      <p class="t-sub">Comprobante ${t.id}<br>${t.fecha}<br>Atendido por: ${t.cajero}</p>
      <hr>
      <p style="margin:2px 0;"><b>Cliente:</b> ${t.cliente.nombre}<br>
      Tel: ${t.cliente.telefono} · ${t.cliente.correo}<br>
      Pago: ${t.cliente.pago}${t.cliente.notas ? "<br>Nota: " + t.cliente.notas : ""}</p>
      <hr>
      <table>${rows}</table>
      <hr>
      <table>
        <tr><td>Subtotal</td><td class="num">${money(t.subtotal)}</td></tr>
        <tr><td>Descuento (${t.discountPct}%)</td><td class="num">-${money(t.discountAmt)}</td></tr>
        <tr><td>IVA ${t.applyIva ? "(13%)" : "(no aplica)"}</td><td class="num">${money(t.ivaAmt)}</td></tr>
        <tr><td><b>TOTAL</b></td><td class="num"><b>${money(t.total)}</b></td></tr>
      </table>
      <hr>
      <p style="text-align:center;font-size:.72rem;">¡Gracias por su compra!</p>
    </div>`;
}

/* ============================================================
   9. IMPRIMIR / EXPORTAR PDF / EXPORTAR EXCEL
============================================================ */

// Imprimir: usa la función nativa del navegador. El CSS (@media print)
// se encarga de que SOLO se vea el ticket en el papel.
$("#print-btn").addEventListener("click", ()=> window.print());

// ---- Exportar a PDF con la librería jsPDF ----
$("#pdf-btn").addEventListener("click", ()=>{
  if (!lastTicket) return; // seguridad: no hay nada que exportar todavía

  const { jsPDF } = window.jspdf; // jsPDF se cargó por CDN en el <head> del HTML
  // Crea un documento con tamaño de "recibo": 80mm de ancho x 150mm de alto
  const doc = new jsPDF({ unit:"mm", format:[80, 150] });
  let y = 10; // posición vertical actual; se va incrementando línea por línea

  doc.setFont(undefined, "bold"); doc.setFontSize(13);
  doc.text("Bajo Cero Heladeria", 40, y, { align:"center" }); y += 6;
  doc.setFont(undefined, "normal"); doc.setFontSize(8);
  doc.text(`Comprobante ${lastTicket.id}`, 40, y, {align:"center"}); y += 4;
  doc.text(lastTicket.fecha, 40, y, {align:"center"}); y += 4;
  doc.text(`Atendido por: ${lastTicket.cajero}`, 40, y, {align:"center"}); y += 6;
  doc.text(`Cliente: ${lastTicket.cliente.nombre}`, 5, y); y += 4;
  doc.text(`Tel: ${lastTicket.cliente.telefono}`, 5, y); y += 4;
  doc.text(`Pago: ${lastTicket.cliente.pago}`, 5, y); y += 6;

  // Una línea de texto por cada producto del ticket
  lastTicket.items.forEach(it=>{
    doc.text(`${it.name} x${it.qty}`, 5, y);
    doc.text(money(it.price*it.qty), 75, y, {align:"right"});
    y += 4.5;
  });

  y += 2;
  doc.line(5, y, 75, y); y += 5; // línea horizontal separadora
  doc.text("Subtotal", 5, y); doc.text(money(lastTicket.subtotal), 75, y, {align:"right"}); y += 4.5;
  doc.text(`Descuento (${lastTicket.discountPct}%)`, 5, y); doc.text("-"+money(lastTicket.discountAmt), 75, y, {align:"right"}); y += 4.5;
  doc.text("IVA", 5, y); doc.text(money(lastTicket.ivaAmt), 75, y, {align:"right"}); y += 4.5;
  doc.setFont(undefined, "bold");
  doc.text("TOTAL", 5, y); doc.text(money(lastTicket.total), 75, y, {align:"right"}); y += 8;
  doc.setFont(undefined, "normal"); doc.setFontSize(7);
  doc.text("Gracias por su compra", 40, y, {align:"center"});

  doc.save(`${lastTicket.id}.pdf`); // dispara la descarga del archivo
  showToast("PDF descargado.");
});

// ---- Exportar a Excel con la librería SheetJS (XLSX) ----
$("#excel-btn").addEventListener("click", ()=>{
  if (!lastTicket) return;

  // "rows" es un arreglo de arreglos (aoa = array of arrays): cada
  // arreglo interno representa una fila de la hoja de cálculo.
  const rows = [
    ["Bajo Cero Heladería - Comprobante", lastTicket.id],
    ["Fecha", lastTicket.fecha],
    ["Cajero", lastTicket.cajero],
    ["Cliente", lastTicket.cliente.nombre],
    ["Teléfono", lastTicket.cliente.telefono],
    ["Correo", lastTicket.cliente.correo],
    ["Método de pago", lastTicket.cliente.pago],
    [], // fila vacía, solo de separación visual
    ["Producto", "Cantidad", "Precio Unit.", "Subtotal"],
    ...lastTicket.items.map(it=>[it.name, it.qty, it.price, +(it.price*it.qty).toFixed(2)]),
    [],
    ["Subtotal", "", "", lastTicket.subtotal],
    [`Descuento (${lastTicket.discountPct}%)`, "", "", -lastTicket.discountAmt],
    ["IVA", "", "", lastTicket.ivaAmt],
    ["TOTAL", "", "", lastTicket.total],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);     // convierte el arreglo en una "hoja" de Excel
  ws["!cols"] = [{wch:26},{wch:10},{wch:12},{wch:12}]; // ancho de cada columna
  const wb = XLSX.utils.book_new();              // crea un libro de Excel vacío
  XLSX.utils.book_append_sheet(wb, ws, "Comprobante"); // le agrega la hoja con nombre "Comprobante"
  XLSX.writeFile(wb, `${lastTicket.id}.xlsx`);   // genera el archivo y dispara la descarga
  showToast("Excel descargado.");
});

/* ============================================================
   10. HISTORIAL DE VENTAS (localStorage) + BOTÓN "NUEVA VENTA"
============================================================ */

// Guarda el ticket actual al principio del historial (para que
// aparezca primero) y limita el historial a los últimos 50 registros.
function persistSale(){
  if (!lastTicket) return;
  const sales = getSales();
  sales.unshift(lastTicket);          // unshift agrega AL INICIO del arreglo
  saveSales(sales.slice(0, 50));      // slice(0,50) se queda solo con los primeros 50
}

// Redibuja la lista de historial en el panel correspondiente
function renderHistory(){
  const box = $("#history-list");
  const sales = getSales();
  if (sales.length === 0){
    box.innerHTML = `<p style="color:var(--text-soft);font-size:.85rem;">Sin ventas registradas todavía.</p>`;
    return;
  }
  box.innerHTML = "";
  sales.forEach(s=>{
    const div = document.createElement("div");
    div.className = "history-item";
    div.innerHTML = `
      <div>
        <div>${s.cliente.nombre}</div>
        <div class="h-meta">${s.fecha} · ${s.id}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <b>${money(s.total)}</b>
        <button type="button" class="btn-ver" data-id="${s.id}">Ver</button>
        <button type="button" class="btn-del-venta" data-id="${s.id}">🗑</button>
      </div>`;

    div.querySelector(".btn-ver").addEventListener("click", ()=>{
      lastTicket = s;
      renderTicket(s);
      $("#ticket-panel").style.display = "block";
      $("#ticket-panel").scrollIntoView({ behavior:"smooth", block:"start" });
    });

    div.querySelector(".btn-del-venta").addEventListener("click", ()=>{
      deleteSale(s.id);
    });

    box.appendChild(div);
  });
}

// Elimina una venta del historial por su id, y vuelve a dibujar la lista.
// OJO: esto NO devuelve el stock vendido al inventario (borrar el registro
// de una venta no significa que los productos vuelvan a existir).
function deleteSale(id){
  const confirmar = confirm("¿Seguro que quieres eliminar esta venta del historial?");
  if (!confirmar) return;

  const sales = getSales().filter(s => s.id !== id); // se queda con todas MENOS la que coincide
  saveSales(sales);
  renderHistory();
  showToast("Venta eliminada.");
}

// Limpia todo para poder registrar una venta nueva desde cero
function resetSale(){
  cart = [];
  renderCart();
  $("#customer-form").reset();       // vacía todos los campos del formulario
  $("#customer-form").querySelectorAll("input").forEach(i=>i.classList.remove("touched")); // quita los bordes rojos
  $("#discount-input").value = 0;
  $("#iva-check").checked = true;
  calculateTotals();
  $("#ticket-panel").style.display = "none"; // oculta el comprobante anterior
  lastTicket = null;
}

$("#reset-btn").addEventListener("click", resetSale);

/* ============================================================
   11. INICIALIZACIÓN
   ------------------------------------------------------------
   Estas líneas se ejecutan UNA sola vez, apenas el navegador
   termina de cargar este archivo (recordemos que <script> está
   al final del <body>, así que el HTML ya existe en ese momento).
============================================================ */
renderMenu();       // dibuja la vitrina de productos (con su stock) y llena el <select>
renderCart();       // dibuja el carrito (vacío al inicio) y calcula totales en $0.00
calculateTotals();  // por seguridad, calcula los totales una vez más

// Si ya había una sesión guardada de una visita anterior, entra
// directo a la app sin pedir el login de nuevo.
const savedSession = JSON.parse(localStorage.getItem(LS_SESSION) || "null");
if (savedSession){ enterApp(savedSession); }