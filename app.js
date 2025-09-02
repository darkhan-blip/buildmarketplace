/* app.js — исправленная и надёжная версия */
(function () {
  // Константы
  const DB_KEY = "kaspi_demo_db_v2";
  const AUTH_KEY = "kaspi_demo_auth_v2";

  // placeholder svg builder
  function placeholderDataUrl(text = "Изображение") {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'>
      <rect width='100%' height='100%' fill='#f3f4f6'/>
      <rect y='540' width='100%' height='60' fill='${'#e30613'}'/>
      <text x='20' y='40' font-family='Arial' font-size='28' fill='#111'>${escapeHtml(text)}</text>
    </svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  // Безопасное экранирование
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

  // Toast
  function toast(msg) {
    let t = document.querySelector(".toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(t._hide);
    t._hide = setTimeout(() => t.style.display = "none", 1800);
  }

  // DB helpers
  function initDB() {
    if (localStorage.getItem(DB_KEY)) return;
    const example = {
      users: [
        { id: 1, username: "buyer", role: "user", email: "buyer@example.com", phone: "+7 700 000 0000", orders: [] },
        { id: 2, username: "megacorp", role: "company", companyName: "MegaCorp", email: "sales@megacorp.kz", phone: "+7 701 111 2233", desc: "Официальный магазин электроники" }
      ],
      products: [
        { id: 100, sellerId: 2, name: "Ноутбук 16GB RAM", price: 299000, desc: "Лёгкий, быстрый, рабочий зверь", image: placeholderDataUrl("Ноутбук") },
        { id: 101, sellerId: 2, name: "Игровая мышь", price: 12990, desc: "Сенсор 26К DPI, RGB", image: placeholderDataUrl("Мышь") }
      ],
      orders: [],
      carts: {} // userId -> {items: [{productId, qty}]}
    };
    localStorage.setItem(DB_KEY, JSON.stringify(example));
  }

  function readDB() { try { return JSON.parse(localStorage.getItem(DB_KEY) || "{}"); } catch (e) { return {}; } }
  function writeDB(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }

  // Auth
  function getCurrentUser() {
    const id = Number(localStorage.getItem(AUTH_KEY));
    if (!id) return null;
    const db = readDB();
    return db.users.find(u => u.id === id) || null;
  }
  function loginUserByName(username) {
    const db = readDB();
    const user = db.users.find(u => u.username === username);
    if (!user) return { ok: false, error: "Пользователь не найден" };
    localStorage.setItem(AUTH_KEY, String(user.id));
    return { ok: true, user };
  }
  function registerUser({ username, role, companyName, email, phone }) {
    const db = readDB();
    if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      return { ok: false, error: "Имя занято" };
    }
    const id = Date.now();
    const newUser = { id, username, role, email: email || "", phone: phone || "" };
    if (role === "company") {
      newUser.companyName = companyName || username;
      newUser.desc = "";
    } else {
      newUser.orders = [];
    }
    db.users.push(newUser);
    writeDB(db);
    localStorage.setItem(AUTH_KEY, String(id));
    return { ok: true, user: newUser };
  }
  function logout() {
    localStorage.removeItem(AUTH_KEY);
    location.href = "login.html";
  }

  // Products
  function listProducts() {
    return (readDB().products || []);
  }
  function listCompanyProducts(companyId) {
    return listProducts().filter(p => p.sellerId === companyId);
  }
  function addProduct({ name, price, desc, image }) {
    const user = getCurrentUser();
    if (!user || user.role !== "company") return { ok: false, error: "Только компании могут добавлять товары" };
    const db = readDB();
    const product = { id: Date.now(), sellerId: user.id, name: name.trim(), price: Number(price) || 0, desc: desc || "", image: image || placeholderDataUrl(name) };
    db.products.push(product);
    writeDB(db);
    return { ok: true, product };
  }
  function removeProduct(productId) {
    const user = getCurrentUser();
    if (!user) return { ok: false };
    const db = readDB();
    const p = db.products.find(p => p.id === productId);
    if (!p) return { ok: false };
    if (user.role !== "company" || p.sellerId !== user.id) return { ok: false };
    db.products = db.products.filter(x => x.id !== productId);
    writeDB(db);
    return { ok: true };
  }

  // Cart & Orders
  function getCart(userId) {
    const db = readDB();
    db.carts = db.carts || {};
    if (!db.carts[userId]) db.carts[userId] = { items: [] };
    return db.carts[userId];
  }
  function saveCart(userId, cart) {
    const db = readDB();
    db.carts = db.carts || {};
    db.carts[userId] = cart;
    writeDB(db);
  }
  function addToCart(productId, qty = 1) {
    const user = getCurrentUser();
    if (!user || user.role !== "user") { toast("Корзина доступна только покупателю"); return; }
    const db = readDB();
    const p = db.products.find(x => x.id === productId);
    if (!p) { toast("Товар не найден"); return; }
    const cart = getCart(user.id);
    const item = cart.items.find(i => i.productId === productId);
    if (item) item.qty += qty;
    else cart.items.push({ productId, qty });
    saveCart(user.id, cart);
    toast("Добавлено в корзину");
  }
  function removeFromCart(productId) {
    const user = getCurrentUser();
    if (!user) return;
    const cart = getCart(user.id);
    cart.items = cart.items.filter(i => i.productId !== productId);
    saveCart(user.id, cart);
  }
  function checkout() {
    const user = getCurrentUser();
    if (!user || user.role !== "user") return toast("Только покупатель может оформить заказ");
    const db = readDB();
    const cart = getCart(user.id);
    if (!cart.items.length) return toast("Корзина пуста");
    const items = cart.items.map(ci => {
      const p = db.products.find(pp => pp.id === ci.productId);
      return { productId: p.id, name: p.name, qty: ci.qty, priceAtPurchase: p.price, sellerId: p.sellerId };
    });
    const total = items.reduce((s, i) => s + i.qty * i.priceAtPurchase, 0);
    const order = { id: Date.now(), userId: user.id, items, total, createdAt: new Date().toISOString() };
    db.orders = db.orders || [];
    db.orders.push(order);
    const u = db.users.find(u => u.id === user.id);
    if (!u.orders) u.orders = [];
    u.orders.push(order.id);
    db.carts[user.id] = { items: [] };
    writeDB(db);
    toast("Заказ оформлен");
    setTimeout(() => location.reload(), 500);
  }

  // Helpers
  function formatPrice(kzt) { return new Intl.NumberFormat("ru-RU").format(Number(kzt)) + " ₸"; }

  // Navbar renderer
  function renderNavbar(active) {
    const user = getCurrentUser();
    const authLinks = user ? `
      <a class="kaspi-red" href="profile.html">Профиль</a>
      <a href="#" id="nav-logout">Выход</a>
    ` : `<a class="kaspi-red" href="login.html">Войти</a>`;
    return `
      <div class="navbar">
        <div class="container">
          <div class="row">
            <a class="brand" href="index.html"><span class="dot"></span><span>BuildMarket</span></a>
            <div class="search"><input id="searchInput" placeholder="Поиск по товарам"><button class="btn" id="searchBtn">Найти</button></div>
            <div class="nav-links">
              <a href="index.html" ${active === "home" ? "style='font-weight:700'" : ""}>Каталог</a>
              <a href="profile.html" ${active === "profile" ? "style='font-weight:700'" : ""}>Кабинет</a>
              ${authLinks}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Mounters
  function mountHome() {
    initDB();
    const root = document.getElementById("app");
    root.innerHTML = renderNavbar("home") + `
      <div class="container">
        <div class="hero">
          <span class="pill">darik</span>
          <h2>Товары от компаний</h2>
        </div>
        <div class="section">
          <div class="grid" id="grid"></div>
        </div>
        <div class="footer">contact darik for more</div>
      </div>
    `;
    // attach navbar handlers
    const logoutLink = document.getElementById("nav-logout");
    if (logoutLink) logoutLink.addEventListener("click", (e) => { e.preventDefault(); logout(); });

    const searchBtn = document.getElementById("searchBtn");
    const searchInput = document.getElementById("searchInput");
    const all = listProducts();
    function render(products) {
      const grid = document.getElementById("grid");
      grid.innerHTML = "";
      if (!products.length) {
        grid.innerHTML = `<div class="empty">Товары не найдены</div>`;
        return;
      }
      products.forEach(p => {
        const card = document.createElement("div");
        card.className = "card";
        const img = document.createElement("img");
        img.src = p.image || placeholderDataUrl(p.name);
        img.alt = p.name;
        const pad = document.createElement("div");
        pad.className = "pad";
        const title = document.createElement("div");
        title.className = "title";
        title.textContent = p.name;
        const price = document.createElement("div");
        price.className = "price";
        price.textContent = formatPrice(p.price);
        const meta = document.createElement("div");
        meta.className = "meta";
        const db = readDB();
        const seller = (db.users || []).find(u => u.id === p.sellerId);
        meta.textContent = seller ? (seller.companyName || seller.username) : "Компания";
        const actions = document.createElement("div");
        actions.className = "actions";

        const addBtn = document.createElement("button");
        addBtn.className = "btn small";
        addBtn.textContent = "В корзину";
        addBtn.addEventListener("click", () => addToCart(p.id, 1));
        const moreBtn = document.createElement("button");
        moreBtn.className = "btn ghost small";
        moreBtn.textContent = "Подробнее";
        moreBtn.addEventListener("click", () => { alert(`${p.name}\n\n${p.desc || "Описание отсутствует"}\n\nЦена: ${formatPrice(p.price)}`); });

        // Only allow "Add to cart" if current user is 'user'
        const current = getCurrentUser();
        if (!current || current.role !== "user") {
          addBtn.disabled = true;
          addBtn.classList.add("ghost");
        }

        actions.appendChild(addBtn);
        actions.appendChild(moreBtn);

        pad.appendChild(title);
        pad.appendChild(price);
        pad.appendChild(meta);
        pad.appendChild(actions);

        card.appendChild(img);
        card.appendChild(pad);
        grid.appendChild(card);
      });
    }
    render(all);

    // Search
    if (searchBtn) searchBtn.addEventListener("click", () => {
      const q = (searchInput.value || "").trim().toLowerCase();
      const filtered = all.filter(p => p.name.toLowerCase().includes(q) || (p.desc || "").toLowerCase().includes(q));
      render(filtered);
    });
    if (searchInput) searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") searchBtn.click(); });
  }

  function mountLogin() {
    initDB();
    const root = document.getElementById("app");
    root.innerHTML = renderNavbar() + `
      <div class="container section">
        <div class="row">
          <div class="col">
            <div class="card form">
              <h3>Вход</h3>
              <label>Имя пользователя</label>
              <input id="loginName" placeholder="buyer / megacorp"/>
              <button class="btn" id="loginBtn">Войти</button>
            </div>
          </div>
          <div class="col">
            <div class="card form">
              <h3>Регистрация</h3>
              <label>Имя</label>
              <input id="regName" placeholder="Ваше имя / название"/>
              <label>Роль</label>
              <select id="regRole"><option value="user">Покупатель</option><option value="company">Компания</option></select>
              <div id="companyExtra" style="display:none">
                <label>Название компании</label><input id="regCompany" placeholder="ООО Ромашка"/>
              </div>
              <label>Email</label><input id="regEmail" placeholder="you@example.com"/>
              <label>Телефон</label><input id="regPhone" placeholder="+7..."/>
              <button class="btn" id="regBtn">Зарегистрироваться</button>
            </div>
          </div>
        </div>
      </div>
      <div class="toast"></div>
    `;
    document.getElementById("regRole").addEventListener("change", function () {
      document.getElementById("companyExtra").style.display = this.value === "company" ? "block" : "none";
    });
    document.getElementById("loginBtn").addEventListener("click", () => {
      const name = document.getElementById("loginName").value.trim();
      if (!name) return toast("Введите имя");
      const res = loginUserByName(name);
      if (!res.ok) return toast(res.error);
      location.href = "profile.html";
    });
    document.getElementById("regBtn").addEventListener("click", () => {
      const username = document.getElementById("regName").value.trim();
      const role = document.getElementById("regRole").value;
      const email = document.getElementById("regEmail").value.trim();
      const phone = document.getElementById("regPhone").value.trim();
      const companyName = role === "company" ? document.getElementById("regCompany").value.trim() : "";
      if (!username) return toast("Введите имя");
      const res = registerUser({ username, role, companyName, email, phone });
      if (!res.ok) return toast(res.error);
      location.href = "profile.html";
    });
    const logoutLink = document.getElementById("nav-logout");
    if (logoutLink) logoutLink.addEventListener("click", (e) => { e.preventDefault(); logout(); });
  }

  function mountProfile() {
    initDB();
    const user = getCurrentUser();
    if (!user) return (location.href = "login.html");
    const root = document.getElementById("app");
    const isCompany = user.role === "company";
    root.innerHTML = renderNavbar("profile") + `
      <div class="container section">
        <div class="row">
          <div class="col">
            <div class="card form">
              <h3>${isCompany ? "Профиль компании" : "Профиль пользователя"}</h3>
              <label>${isCompany ? "Название компании" : "Имя"}</label>
              <input id="pfName" value="${escapeHtml(isCompany ? (user.companyName || user.username) : user.username)}"/>
              ${isCompany ? `<label>Описание</label><textarea id="pfDesc" rows="3">${escapeHtml(user.desc || "")}</textarea>` : ""}
              <label>Email</label><input id="pfEmail" value="${escapeHtml(user.email || "")}"/>
              <label>Телефон</label><input id="pfPhone" value="${escapeHtml(user.phone || "")}"/>
              <div class="row">
                <div class="col"><button class="btn" id="savePf">Сохранить</button></div>
                <div class="col" style="text-align:right"><button class="btn ghost" id="logoutBtn">Выйти</button></div>
              </div>
            </div>
          </div>
          <div class="col">
            ${isCompany ? `
            <div class="card form">
              <h3>Добавить товар</h3>
              <label>Название</label><input id="pName" placeholder="Смартфон"/>
              <label>Цена (₸)</label><input id="pPrice" type="number" placeholder="99000"/>
              <label>Описание</label><textarea id="pDesc" rows="3" placeholder="Короткое описание"></textarea>
              <label>Ссылка на изображение (опц.)</label><input id="pImg" placeholder="https://..."/>
              <button class="btn" id="addP">Добавить товар</button>
            </div>
            ` : `
            <div class="card form">
              <h3>Корзина</h3>
              <div id="cartView"></div>
              <button class="btn" id="checkoutBtn">Оформить заказ</button>
            </div>
            `}
          </div>
        </div>

        ${isCompany ? `
        <div class="section">
          <h3>Товары компании</h3>
          <table class="table" id="tblProducts"><thead><tr><th>Название</th><th>Цена</th><th>Действия</th></tr></thead><tbody></tbody></table>
        </div>` : `
        <div class="section">
          <h3>История заказов</h3>
          <table class="table" id="tblOrders"><thead><tr><th>ID</th><th>Товары</th><th>Итог</th><th>Дата</th></tr></thead><tbody></tbody></table>
        </div>`}

      </div>
      <div class="toast"></div>
    `;

    // handlers
    document.getElementById("savePf").addEventListener("click", () => {
      const db = readDB();
      const u = db.users.find(x => x.id === user.id);
      if (!u) return toast("Пользователь не найден");
      if (isCompany) {
        u.companyName = document.getElementById("pfName").value.trim();
        u.desc = document.getElementById("pfDesc").value.trim();
      } else {
        u.username = document.getElementById("pfName").value.trim();
      }
      u.email = document.getElementById("pfEmail").value.trim();
      u.phone = document.getElementById("pfPhone").value.trim();
      writeDB(db);
      toast("Сохранено");
    });

    document.getElementById("logoutBtn").addEventListener("click", () => logout());

    if (isCompany) {
      document.getElementById("addP").addEventListener("click", () => {
        const name = document.getElementById("pName").value.trim();
        const price = Number(document.getElementById("pPrice").value);
        const desc = document.getElementById("pDesc").value.trim();
        const image = document.getElementById("pImg").value.trim() || null;
        if (!name || !price) return toast("Название и цена обязательны");
        const res = addProduct({ name, price, desc, image });
        if (!res.ok) return toast(res.error);
        document.getElementById("pName").value = "";
        document.getElementById("pPrice").value = "";
        document.getElementById("pDesc").value = "";
        document.getElementById("pImg").value = "";
        renderCompanyProducts();
        toast("Товар добавлен");
      });
      function renderCompanyProducts() {
        const tbody = document.querySelector("#tblProducts tbody");
        const items = listCompanyProducts(user.id);
        if (!items.length) {
          tbody.innerHTML = `<tr><td colspan="3" class="empty">Товары отсутствуют</td></tr>`;
          return;
        }
        tbody.innerHTML = "";
        items.forEach(p => {
          const tr = document.createElement("tr");
          const tdName = document.createElement("td"); tdName.textContent = p.name;
          const tdPrice = document.createElement("td"); tdPrice.innerHTML = `<b>${formatPrice(p.price)}</b>`;
          const tdAct = document.createElement("td");
          const btnDel = document.createElement("button");
          btnDel.className = "btn ghost small";
          btnDel.textContent = "Удалить";
          btnDel.addEventListener("click", () => {
            if (!confirm("Удалить товар?")) return;
            const r = removeProduct(p.id);
            if (r.ok) { toast("Удалено"); renderCompanyProducts(); } else toast("Не удалось удалить");
          });
          tdAct.appendChild(btnDel);
          tr.appendChild(tdName); tr.appendChild(tdPrice); tr.appendChild(tdAct);
          tbody.appendChild(tr);
        });
      }
      renderCompanyProducts();
    } else {
      // render cart and orders
      function renderCart() {
        const cartView = document.getElementById("cartView");
        const db = readDB();
        const cart = getCart(user.id);
        if (!cart.items.length) {
          cartView.innerHTML = `<div class="empty">Корзина пуста</div>`;
          return;
        }
        cartView.innerHTML = "";
        cart.items.forEach(ci => {
          const p = db.products.find(pp => pp.id === ci.productId);
          const row = document.createElement("div");
          row.className = "row";
          row.style.alignItems = "center";
          const c1 = document.createElement("div"); c1.className = "col"; c1.innerHTML = `<b>${p.name}</b><div class="meta">${formatPrice(p.price)}</div>`;
          const c2 = document.createElement("div"); c2.className = "col"; c2.textContent = `Кол-во: ${ci.qty}`;
          const c3 = document.createElement("div"); c3.className = "col"; c3.style.textAlign = "right";
          const btn = document.createElement("button"); btn.className = "btn ghost small"; btn.textContent = "Убрать";
          btn.addEventListener("click", () => { removeFromCart(p.id); renderCart(); });
          c3.appendChild(btn);
          row.appendChild(c1); row.appendChild(c2); row.appendChild(c3);
          cartView.appendChild(row);
        });
        const total = cart.items.reduce((s, ci) => {
          const p = db.products.find(pp => pp.id === ci.productId);
          return s + p.price * ci.qty;
        }, 0);
        const totalDiv = document.createElement("div");
        totalDiv.style.textAlign = "right";
        totalDiv.style.marginTop = "8px";
        totalDiv.innerHTML = `<b>Итого: ${formatPrice(total)}</b>`;
        cartView.appendChild(totalDiv);
      }
      document.getElementById("checkoutBtn").addEventListener("click", () => {
        if (!confirm("Подтвердить оформление заказа?")) return;
        checkout();
      });
      renderCart();

      function renderOrders() {
        const db = readDB();
        const orders = (db.orders || []).filter(o => o.userId === user.id).sort((a, b) => b.id - a.id);
        const tbody = document.querySelector("#tblOrders tbody");
        if (!orders.length) {
          tbody.innerHTML = `<tr><td colspan="4" class="empty">Заказов нет</td></tr>`;
          return;
        }
        tbody.innerHTML = "";
        orders.forEach(o => {
          const tr = document.createElement("tr");
          const tdId = document.createElement("td"); tdId.textContent = `#${o.id}`;
          const tdItems = document.createElement("td"); tdItems.textContent = o.items.map(i => `${i.name} × ${i.qty}`).join(", ");
          const tdTotal = document.createElement("td"); tdTotal.innerHTML = `<b>${formatPrice(o.total)}</b>`;
          const tdDate = document.createElement("td"); tdDate.textContent = new Date(o.createdAt).toLocaleString();
          tr.appendChild(tdId); tr.appendChild(tdItems); tr.appendChild(tdTotal); tr.appendChild(tdDate);
          tbody.appendChild(tr);
        });
      }
      renderOrders();
    }
  }

  // Expose mounts
  window.mountHome = mountHome;
  window.mountLogin = mountLogin;
  window.mountProfile = mountProfile;

  // Export some helpers to global scope used by inline buttons (if any)
  window.logout = logout;
  window.addToCart = addToCart;
  window.removeFromCart = removeFromCart;
  window.checkout = checkout;

  // Initialize DB on load
  initDB();
})();
