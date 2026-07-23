export const dynamic = "force-dynamic";

const widgetScript = String.raw`
(function () {
  function booleanValue(value, fallback) {
    if (value == null || value === "") return fallback;
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
    return fallback;
  }

  var script = document.currentScript;
  if (!script || script.dataset.suppertimeLoaded === "true") return;
  script.dataset.suppertimeLoaded = "true";

  var baseUrl = new URL(script.src).origin;
  var scriptUrl = new URL(script.src);
  var formId = script.dataset.formId || scriptUrl.searchParams.get("form") || "";
  var targetId = script.dataset.target || scriptUrl.searchParams.get("target") || (formId ? "suppertime-support-form-" + formId : "");
  var registry = window.SuppertimeSupportForms || (window.SuppertimeSupportForms = {});
  var config = {
    accentColor: script.dataset.accentColor || "#0f766e",
    buttonLabel: script.dataset.buttonLabel || "Support",
    embedMode: script.dataset.embedMode || scriptUrl.searchParams.get("mode") || "floating",
    hideOnMobile: booleanValue(script.dataset.hideOnMobile || scriptUrl.searchParams.get("hideOnMobile"), true),
    intro: script.dataset.intro || "Send a message to our support team.",
    placement: script.dataset.placement || "bottom-right",
    successMessage: script.dataset.successMessage || "Thanks. We received your request.",
    title: script.dataset.title || "Contact support",
    turnstileSiteKey: script.dataset.turnstileSiteKey || ""
  };

  function applyRemoteConfig(remoteConfig) {
    if (!remoteConfig) return;

    config.accentColor = remoteConfig.accentColor || config.accentColor;
    config.buttonLabel = remoteConfig.buttonLabel || config.buttonLabel;
    config.embedMode = remoteConfig.embedMode || config.embedMode;
    config.hideOnMobile = booleanValue(remoteConfig.hideOnMobile, config.hideOnMobile);
    config.intro = remoteConfig.intro || config.intro;
    config.placement = remoteConfig.placement || config.placement;
    config.successMessage = remoteConfig.successMessage || config.successMessage;
    config.title = remoteConfig.title || config.title;
    config.turnstileSiteKey = remoteConfig.turnstileSiteKey || "";
  }

  function mountWidget() {
  var isInline = config.embedMode === "inline";
  var usesExternalTrigger = config.embedMode === "external-trigger";
  var inlineTarget = targetId ? document.getElementById(targetId) : null;

  if (isInline && !inlineTarget) return;

  var style = document.createElement("style");
  style.textContent = [
    ".st-support-button{position:fixed;z-index:2147483000;border:0;border-radius:999px;background:"+config.accentColor+";color:#fff;padding:12px 16px;font:600 14px system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 10px 30px rgba(15,23,42,.18);cursor:pointer}",
    ".st-support-button[data-placement='bottom-right']{right:20px;bottom:20px}",
    ".st-support-button[data-placement='bottom-left']{left:20px;bottom:20px}",
    (config.hideOnMobile && !isInline && !usesExternalTrigger) ? "@media (max-width: 767px){.st-support-button{display:none}}" : "",
    ".st-support-overlay{position:fixed;inset:0;z-index:2147483001;display:none;background:rgba(15,23,42,.42);padding:20px}",
    ".st-support-overlay[data-open='true']{display:flex;align-items:center;justify-content:center}",
    ".st-support-inline{width:100%;display:block}",
    ".st-support-panel{width:min(100%,420px);max-height:calc(100vh - 40px);overflow:auto;border-radius:12px;background:#fff!important;color:#18181b!important;box-shadow:0 24px 80px rgba(15,23,42,.28);font:14px system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}",
    ".st-support-inline .st-support-panel{width:100%;max-height:none;box-sizing:border-box;border:1px solid #e4e4e7;box-shadow:none}",
    ".st-support-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;border-bottom:1px solid #e4e4e7;padding:18px}",
    ".st-support-title{margin:0!important;color:#18181b!important;font-size:18px!important;line-height:1.25!important;font-weight:700!important}",
    ".st-support-intro{margin:6px 0 0!important;color:#71717a!important;line-height:1.4!important}",
    ".st-support-close{border:0;background:transparent;color:#71717a;cursor:pointer;font-size:24px;line-height:1}",
    ".st-support-inline .st-support-close{display:none}",
    ".st-support-form{display:flex;flex-direction:column;gap:12px;padding:18px}",
    ".st-support-field{display:flex;flex-direction:column;gap:6px}",
    ".st-support-label{font-size:12px!important;font-weight:600!important;color:#3f3f46!important}",
    ".st-support-input,.st-support-textarea{appearance:none!important;-webkit-appearance:none!important;width:100%!important;box-sizing:border-box!important;border:1px solid #d4d4d8!important;border-radius:8px!important;background:#fff!important;color:#18181b!important;-webkit-text-fill-color:#18181b!important;padding:10px 11px!important;font:14px system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif!important;line-height:1.4!important;box-shadow:none!important;outline:none!important}",
    ".st-support-input:focus,.st-support-textarea:focus{border-color:"+config.accentColor+"!important;background:#fff!important;color:#18181b!important;-webkit-text-fill-color:#18181b!important;box-shadow:0 0 0 3px rgba(15,118,110,.16)!important;outline:none!important}",
    ".st-support-input:-webkit-autofill,.st-support-input:-webkit-autofill:hover,.st-support-input:-webkit-autofill:focus,.st-support-textarea:-webkit-autofill,.st-support-textarea:-webkit-autofill:hover,.st-support-textarea:-webkit-autofill:focus{-webkit-box-shadow:0 0 0 1000px #fff inset!important;-webkit-text-fill-color:#18181b!important;caret-color:#18181b!important}",
    ".st-support-textarea{min-height:120px!important;resize:vertical!important}",
    ".st-support-submit{border:0;border-radius:8px;background:"+config.accentColor+";color:#fff;padding:11px 14px;font-weight:700;cursor:pointer}",
    ".st-support-submit[disabled]{opacity:.65;cursor:not-allowed}",
    ".st-support-fields{display:flex;flex-direction:column;gap:12px}",
    ".st-support-confirmation{display:none;flex-direction:column;gap:12px;padding:18px}",
    ".st-support-confirmation[data-visible='true']{display:flex}",
    ".st-support-confirmation-title{margin:0;font-size:16px;line-height:1.3;font-weight:700}",
    ".st-support-confirmation-message{margin:0;color:#3f3f46;line-height:1.45}",
    ".st-support-confirmation-ticket{margin:0;border-radius:8px;background:#f4f4f5;padding:10px 12px;color:#27272a;font-weight:700}",
    ".st-support-secondary{border:1px solid #d4d4d8;border-radius:8px;background:#fff;color:#18181b;padding:10px 12px;font-weight:700;cursor:pointer}",
    ".st-support-status{min-height:18px;font-size:13px;line-height:1.35}",
    ".st-support-status[data-kind='error']{color:#b91c1c}",
    ".st-support-status[data-kind='success']{color:#047857}",
    ".st-support-company{position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden}"
  ].join("");
  document.head.appendChild(style);

  var button = document.createElement("button");
  button.type = "button";
  button.className = "st-support-button";
  button.dataset.placement = config.placement === "bottom-left" ? "bottom-left" : "bottom-right";
  button.textContent = config.buttonLabel;

  var overlay = document.createElement("div");
  overlay.className = isInline ? "st-support-inline" : "st-support-overlay";
  overlay.innerHTML =
    '<div class="st-support-panel" role="dialog" aria-modal="true" aria-labelledby="st-support-title">' +
      '<div class="st-support-header">' +
        '<div><h2 class="st-support-title" id="st-support-title"></h2><p class="st-support-intro"></p></div>' +
        '<button type="button" class="st-support-close" aria-label="Close support form">&times;</button>' +
      '</div>' +
      '<form class="st-support-form">' +
        '<div class="st-support-fields">' +
          '<label class="st-support-field"><span class="st-support-label">Name</span><input class="st-support-input" name="name" autocomplete="name"></label>' +
          '<label class="st-support-field"><span class="st-support-label">Email</span><input class="st-support-input" name="email" type="email" autocomplete="email" required></label>' +
          '<label class="st-support-field"><span class="st-support-label">Subject</span><input class="st-support-input" name="subject" required></label>' +
          '<label class="st-support-field"><span class="st-support-label">Message</span><textarea class="st-support-textarea" name="message" required></textarea></label>' +
          '<div class="st-support-captcha"></div>' +
          '<label class="st-support-company">Company<input name="company" tabindex="-1" autocomplete="off"></label>' +
          '<button class="st-support-submit" type="submit">Send message</button>' +
          '<div class="st-support-status" role="status" aria-live="polite"></div>' +
        '</div>' +
      '</form>' +
      '<div class="st-support-confirmation" aria-live="polite">' +
        '<h3 class="st-support-confirmation-title">Request received</h3>' +
        '<p class="st-support-confirmation-message"></p>' +
        '<p class="st-support-confirmation-ticket"></p>' +
        '<button class="st-support-secondary" type="button">Send another message</button>' +
      '</div>' +
    '</div>';

  overlay.querySelector(".st-support-title").textContent = config.title;
  overlay.querySelector(".st-support-intro").textContent = config.intro;
  if (isInline) {
    overlay.querySelector(".st-support-panel").removeAttribute("role");
    overlay.querySelector(".st-support-panel").removeAttribute("aria-modal");
  }

  function loadTurnstile() {
    return new Promise(function (resolve, reject) {
      if (!config.turnstileSiteKey) {
        resolve(null);
        return;
      }

      if (window.turnstile) {
        resolve(window.turnstile);
        return;
      }

      var existing = document.querySelector("script[data-st-turnstile='true']");
      if (existing) {
        existing.addEventListener("load", function () { resolve(window.turnstile); });
        existing.addEventListener("error", reject);
        return;
      }

      var turnstileScript = document.createElement("script");
      turnstileScript.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      turnstileScript.async = true;
      turnstileScript.defer = true;
      turnstileScript.dataset.stTurnstile = "true";
      turnstileScript.addEventListener("load", function () { resolve(window.turnstile); });
      turnstileScript.addEventListener("error", reject);
      document.head.appendChild(turnstileScript);
    });
  }

  function renderTurnstile() {
    if (!config.turnstileSiteKey) return;

    loadTurnstile().then(function (turnstile) {
      var container = overlay.querySelector(".st-support-captcha");
      if (!turnstile || !container || container.dataset.rendered === "true") return;

      turnstile.render(container, {
        sitekey: config.turnstileSiteKey
      });
      container.dataset.rendered = "true";
    });
  }

  function resetTurnstile() {
    if (!config.turnstileSiteKey || !window.turnstile) return;

    var container = overlay.querySelector(".st-support-captcha");
    if (container && container.dataset.rendered === "true") {
      window.turnstile.reset(container);
    }
  }

  function setOpen(open) {
    if (isInline) {
      renderTurnstile();
      return;
    }

    overlay.dataset.open = open ? "true" : "false";
    if (open) renderTurnstile();
  }

  function isOpen() {
    return overlay.dataset.open === "true";
  }

  function showForm() {
    var form = overlay.querySelector(".st-support-form");
    var confirmation = overlay.querySelector(".st-support-confirmation");
    var status = overlay.querySelector(".st-support-status");

    if (form) {
      form.reset();
      form.style.display = "flex";
    }
    if (confirmation) confirmation.dataset.visible = "false";
    if (status) {
      status.dataset.kind = "";
      status.textContent = "";
    }
    resetTurnstile();
  }

  function showConfirmation(ticketNumber) {
    var form = overlay.querySelector(".st-support-form");
    var confirmation = overlay.querySelector(".st-support-confirmation");
    var message = overlay.querySelector(".st-support-confirmation-message");
    var ticket = overlay.querySelector(".st-support-confirmation-ticket");

    if (form) form.style.display = "none";
    if (message) message.textContent = config.successMessage;
    if (ticket) {
      ticket.textContent = ticketNumber ? "Ticket #" + ticketNumber : "";
      ticket.style.display = ticketNumber ? "block" : "none";
    }
    if (confirmation) confirmation.dataset.visible = "true";
  }

  if (!isInline) button.addEventListener("click", function () { setOpen(true); });
  overlay.querySelector(".st-support-close").addEventListener("click", function () { setOpen(false); });
  overlay.querySelector(".st-support-secondary").addEventListener("click", showForm);
  overlay.addEventListener("click", function (event) {
    if (event.target === overlay) setOpen(false);
  });

  if (formId) {
    registry[formId] = {
      close: function () { setOpen(false); },
      open: function () {
        showForm();
        setOpen(true);
      },
      toggle: function () {
        if (isInline) return;
        if (isOpen()) {
          setOpen(false);
          return;
        }
        showForm();
        setOpen(true);
      }
    };
  }

  window.addEventListener("suppertime:support-form:open", function (event) {
    if (!event.detail || event.detail.formId !== formId) return;
    if (!registry[formId]) return;
    registry[formId].open();
  });

  overlay.querySelector("form").addEventListener("submit", function (event) {
    event.preventDefault();

    var form = event.currentTarget;
    var submit = form.querySelector(".st-support-submit");
    var status = form.querySelector(".st-support-status");
    var data = new FormData(form);
    var payload = {
      captchaToken: data.get("cf-turnstile-response"),
      company: data.get("company"),
      email: data.get("email"),
      formId: formId,
      message: data.get("message"),
      name: data.get("name"),
      pageUrl: window.location.href,
      subject: data.get("subject")
    };

    submit.disabled = true;
    status.dataset.kind = "";
    status.textContent = "Sending...";

    fetch(baseUrl + "/api/support-form/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        return response.json().then(function (body) {
          if (!response.ok) throw new Error(body && body.error ? body.error : "Unable to submit the form.");
          return body;
        });
      })
      .then(function (body) {
        showConfirmation(body.ticketNumber);
        form.reset();
      })
      .catch(function (error) {
        status.dataset.kind = "error";
        status.textContent = error && error.message ? error.message : "Unable to submit the form.";
      })
      .finally(function () {
        resetTurnstile();
        submit.disabled = false;
      });
  });

  if (isInline) {
    inlineTarget.appendChild(overlay);
    renderTurnstile();
  } else if (usesExternalTrigger) {
    document.body.appendChild(overlay);
  } else {
    document.body.appendChild(button);
    document.body.appendChild(overlay);
  }
  }

  function loadConfigAndMount() {
    if (!formId) {
      mountWidget();
      return;
    }

    fetch(baseUrl + "/api/support-form/forms/" + encodeURIComponent(formId))
      .then(function (response) {
        if (!response.ok) throw new Error("Support form is not available.");
        return response.json();
      })
      .then(function (remoteConfig) {
        applyRemoteConfig(remoteConfig);
        mountWidget();
      })
      .catch(function () {
        return;
      });
  }

  loadConfigAndMount();
})();
`;

export async function GET() {
  return new Response(widgetScript, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "text/javascript; charset=utf-8",
    },
  });
}
