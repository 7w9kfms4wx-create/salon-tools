// Всё считается здесь, в браузере. Ни одно число никуда не уходит.
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var rub = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

  // Плавающая подпись в поле повторяет поведение анкет на stelaxai.ru:
  // класс filled вешается, пока в поле что-то есть.
  function wireFields(root) {
    root.querySelectorAll(".v3-ff input").forEach(function (inp) {
      var box = inp.closest(".v3-ff");
      var sync = function () { box.classList.toggle("filled", inp.value !== ""); };
      inp.addEventListener("input", sync);
      inp.addEventListener("change", sync);
      sync();
    });
  }

  function wireFaq(root) {
    root.querySelectorAll(".v3-faq-q").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var open = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", open ? "false" : "true");
        btn.nextElementSibling.setAttribute("data-open", open ? "0" : "1");
      });
    });
  }

  function wireSwitch(group, onChange) {
    var pill = group.querySelector(".v3-switch-pill");
    var btns = [].slice.call(group.querySelectorAll(".v3-switch-btn"));
    function place() {
      var on = group.querySelector(".v3-switch-btn.is-on");
      if (!on || !pill) return;
      pill.style.left = on.offsetLeft + "px";
      pill.style.top = on.offsetTop + "px";
      pill.style.width = on.offsetWidth + "px";
      pill.style.height = on.offsetHeight + "px";
      pill.style.opacity = "1";
    }
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        btns.forEach(function (x) {
          x.classList.toggle("is-on", x === b);
          x.setAttribute("aria-checked", x === b ? "true" : "false");
        });
        place();
        onChange(b.dataset.value);
      });
    });
    requestAnimationFrame(place);
    window.addEventListener("resize", place);
    return function () {
      var on = group.querySelector(".v3-switch-btn.is-on");
      return on ? on.dataset.value : btns[0].dataset.value;
    };
  }

  var KEY = "sebestoimost-v1";
  var IDS = ["dur", "clean", "mat", "price", "fixed", "days", "hours", "load", "payval", "goal"];

  function read(id) {
    var v = parseFloat(String($(id).value).replace(",", ".").replace(/\s/g, ""));
    return isFinite(v) && v >= 0 ? v : 0;
  }

  function save(mode) {
    var data = { mode: mode };
    IDS.forEach(function (id) { data[id] = $(id).value; });
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }

  function restore() {
    var data;
    try { data = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; }
    if (!data) return null;
    IDS.forEach(function (id) { if (data[id] != null) $(id).value = data[id]; });
    return data.mode || null;
  }

  function money(v) { return rub.format(Math.round(v)) + " ₽"; }

  function calc(mode) {
    var dur = read("dur"), clean = read("clean"), mat = read("mat"), price = read("price");
    var fixed = read("fixed"), days = read("days"), hours = read("hours");
    var load = read("load"), payval = read("payval"), goal = read("goal");

    var busy = days * hours * (load / 100);            // занятых часов в месяц
    var chairHour = busy > 0 ? fixed / busy : 0;        // час кресла
    var tHours = (dur + clean) / 60;                    // часов на одну услугу
    var chair = chairHour * tHours;                     // кресло на услугу
    var wanted = goal * tHours;                         // желаемая прибыль с услуги

    var pct = mode === "pct" ? Math.min(payval, 99) / 100 : 0;
    var hourlyPay = mode === "hour" ? payval * tHours : 0;

    var minPrice, goalPrice, payNow;
    if (mode === "pct") {
      minPrice = (mat + chair) / (1 - pct);
      goalPrice = (mat + chair + wanted) / (1 - pct);
      payNow = price * pct;
    } else {
      minPrice = mat + chair + hourlyPay;
      goalPrice = minPrice + wanted;
      payNow = hourlyPay;
    }

    var costNow = mat + chair + payNow;
    var margin = price - costNow;
    var marginPct = price > 0 ? (margin / price) * 100 : 0;
    var contrib = price - mat - payNow;                 // покрывает постоянные расходы
    var breakEven = contrib > 0 ? fixed / contrib : 0;

    return {
      chairHour: chairHour, tHours: tHours, chair: chair, payNow: payNow,
      costNow: costNow, minPrice: minPrice, goalPrice: goalPrice,
      margin: margin, marginPct: marginPct, breakEven: breakEven, busy: busy, price: price
    };
  }

  function render(r) {
    $("r-min").textContent = money(r.minPrice);
    $("r-goal").textContent = money(r.goalPrice);
    $("r-margin").textContent = money(r.margin);

    $("r-margin-note").textContent = r.price > 0
      ? "Это " + r.marginPct.toFixed(1).replace(".", ",") + " процента от цены, которую вы берёте сейчас"
      : "Поставьте текущую цену услуги, и здесь появится ваша маржа";

    $("r-min-note").textContent = r.price > 0 && r.price < r.minPrice
      ? "Сейчас вы работаете ниже этой суммы, то есть в минус"
      : "Ниже этой суммы услуга съедает деньги салона";

    $("d-chair").textContent = money(r.chairHour);
    $("d-busy").textContent = rub.format(Math.round(r.busy)) + " ч";
    $("d-time").textContent = (Math.round(r.tHours * 60)) + " мин";
    $("d-chair-svc").textContent = money(r.chair);
    $("d-pay").textContent = money(r.payNow);
    $("d-cost").textContent = money(r.costNow);
    $("d-be").textContent = r.breakEven > 0
      ? rub.format(Math.ceil(r.breakEven)) + " шт"
      : "не окупится на этой цене";
  }

  function plain(r, mode) {
    var pay = mode === "pct" ? "процент мастеру от чека" : mode === "hour" ? "ставка мастера за час" : "мастер работает сам";
    return [
      "Расчёт себестоимости услуги",
      "",
      "Занятых часов кресла в месяц: " + rub.format(Math.round(r.busy)) + " ч",
      "Час кресла: " + money(r.chairHour),
      "Услуга занимает кресло: " + Math.round(r.tHours * 60) + " мин",
      "Кресло на одну услугу: " + money(r.chair),
      "Оплата мастера (" + pay + "): " + money(r.payNow),
      "Себестоимость услуги: " + money(r.costNow),
      "",
      "Минимальная цена: " + money(r.minPrice),
      "Цена под вашу цель: " + money(r.goalPrice),
      "Остаётся с услуги сейчас: " + money(r.margin),
      "Услуг до окупаемости месяца: " + (r.breakEven > 0 ? rub.format(Math.ceil(r.breakEven)) + " шт" : "не окупится на этой цене"),
      "",
      "Сделано в Стэлакс, stelaxai.ru",
      "Стэлакс отвечает клиентам и записывает их сам. Пять дней за 1 ₽."
    ].join("\n");
  }

  function download(text) {
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sebestoimost-uslugi.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  document.addEventListener("DOMContentLoaded", function () {
    wireFaq(document);
    var form = $("calc");
    if (!form) return;
    wireFields(form);

    var payLabel = $("pay-label");
    var getMode = wireSwitch($("paymode"), function (mode) { apply(mode); run(); });

    function apply(mode) {
      payLabel.textContent = mode === "pct"
        ? "Процент мастеру от чека"
        : mode === "hour" ? "Ставка мастера за час, ₽" : "Оплата не считается";
      $("payval").disabled = mode === "self";
      $("payval").closest(".v3-ff").classList.toggle("filled", $("payval").value !== "");
    }

    function run() { render(calc(getMode())); save(getMode()); }

    var savedMode = restore();
    if (savedMode) {
      [].slice.call($("paymode").querySelectorAll(".v3-switch-btn")).forEach(function (b) {
        var on = b.dataset.value === savedMode;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-checked", on ? "true" : "false");
      });
    }
    apply(getMode());
    wireFields(form);
    form.addEventListener("input", run);
    var dl = $("dl");
    if (dl) dl.addEventListener("click", function () { download(plain(calc(getMode()), getMode())); });
    run();
  });
})();
