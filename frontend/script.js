// -----------------------------
// Resume Analyzer Frontend Script
// This JavaScript file handles all the main interactions for the Resume Analyzer web app.
// Detailed comments are provided for beginners to understand each part of the code.
// -----------------------------

// Stores the last analysis text for download
let lastAnalysisText = "";
// Stores the last resume text sent for analysis (if needed for future use)
let lastAnalysisRequest = null;

// This function is called when the user clicks the 'Upload Resume' button
function setLoading(isLoading) {
  const loadingDiv = document.getElementById("loading");
  const uploadBtn = document.getElementById("uploadBtn");
  if (isLoading) {
    loadingDiv.hidden = false;
    uploadBtn.setAttribute("aria-busy", "true");
    uploadBtn.disabled = true;
  } else {
    loadingDiv.hidden = true;
    uploadBtn.removeAttribute("aria-busy");
    uploadBtn.disabled = false;
  }
}

function renderSkeleton() {
  const suggestionsDiv = document.getElementById("suggestions");
  const skeletonLines = Array.from(
    { length: 8 },
    (_, i) =>
      `<div class='skeleton-block' style='width:${
        Math.random() * 40 + 60
      }%'></div>`
  ).join("");
  suggestionsDiv.innerHTML = `<div class='rating-section'><span class='skeleton-block' style='height:20px;width:160px;margin:0;'></span></div><h2>AI Suggestions:</h2>${skeletonLines}`;
}

function uploadResume() {
  // Get the file input element by its ID
  const fileInput = document.getElementById("resumeUpload");
  // Get the first file selected by the user
  const file = fileInput.files[0];
  // If no file is selected, show an alert and stop
  if (!file) {
    alert("Please select a file to upload.");
    return;
  }

  // Create a FormData object to send the file to the backend
  const formData = new FormData();
  formData.append("resume", file); // 'resume' is the key expected by the backend

  // Get references to UI elements for showing loading and suggestions
  const suggestionsDiv = document.getElementById("suggestions");
  // Get the upload button (to change its text after upload)
  const uploadBtn = document.querySelector('button[onclick="uploadResume()"]');
  // Show the loading message
  setLoading(true);
  // Clear previous suggestions & show skeleton
  renderSkeleton();

  // Send the file to the backend using fetch API
  fetch("http://localhost:5000/upload", {
    method: "POST",
    body: formData,
  })
    .then((response) => response.json()) // Parse the JSON response
    .then((data) => {
      setLoading(false);
      // Get the download button
      const downloadBtn = document.getElementById("downloadBtn");
      // Change the upload button text after first upload
      if (uploadBtn) uploadBtn.textContent = "Regenerate Suggestions";
      // If AI suggestions are present in the response
      if (data.ai_suggestions) {
        let ratingHtml = "";
        // If AI rating is present, show it
        if (data.ai_rating) {
          ratingHtml = `<div class=\"rating-section\"><strong>AI Resume Rating:</strong> <span class=\"rating-value\">${data.ai_rating} / 10</span></div>`;
        }
        // Convert **text** to <strong>text</strong> for bold formatting
        let suggestionsHtml = data.ai_suggestions.replace(
          /\*\*(.*?)\*\*/g,
          "<strong>$1</strong>"
        );
        // Highlight example/rewrite lines (e.g., 'For example:' or 'Instead of:')
        suggestionsHtml = suggestionsHtml.replace(
          /^(\s*[-*]?\s*)(For example:|Instead of:)(.*)$/gim,
          function (match, p1, p2, p3) {
            return `${p1}<span class=\"example-highlight\"><strong>${p2}</strong>${p3}</span>`;
          }
        );
        let exampleHtml = "";
        // If an example section is present, show it
        if (data.ai_example) {
          exampleHtml = `\n<div class=\"example-section\" data-example-root>\n  <div class=\"example-section__header\">\n    <h3 id=\"exampleSectionTitle\">10/10 Example Section</h3>\n    <div class=\"code-actions\">\n      <button class=\"code-btn code-btn--copy\" type=\"button\" aria-label=\"Copy example\" title=\"Copy example\" data-action=\"copy-example\">📋 Copy</button>\n    </div>\n  </div>\n  <pre class=\"code-block\" data-code>${data.ai_example}</pre>\n</div>`;
        }
        // Display the suggestions and rating in the suggestions div
        suggestionsDiv.innerHTML =
          ratingHtml +
          "<h2>AI Suggestions:</h2><pre>" +
          suggestionsHtml +
          "</pre>" +
          exampleHtml;
        // Prepare plain text for download
        lastAnalysisText = `AI Resume Rating: ${
          data.ai_rating ? data.ai_rating + " / 10" : ""
        }\n\nSuggestions:\n${data.ai_suggestions}\n\n10/10 Example Section:\n${
          data.ai_example || ""
        }`;
        // Show the download button
        downloadBtn.classList.add("show");
        // Store the resume text if provided
        if (data.resume_text) lastAnalysisRequest = data.resume_text;
      } else if (data.suggestions) {
        // If only basic suggestions are present (fallback)
        suggestionsDiv.innerHTML =
          "<h2>Suggestions:</h2>" +
          data.suggestions.map((s) => `<p>${s}</p>`).join("");
        lastAnalysisText = data.suggestions.join("\n");
        downloadBtn.classList.add("show");
      } else if (data.error) {
        // If there was an error, show it
        suggestionsDiv.innerHTML = `<div class='error-message'>${data.error}</div>`;
        lastAnalysisText = "";
        downloadBtn.classList.remove("show");
      }
    })
    .catch((error) => {
      // If there was a network or server error
      setLoading(false);
      lastAnalysisText = "";
      document.getElementById("downloadBtn").classList.remove("show");
      console.error("Error:", error);
      alert("An error occurred while uploading the resume. Please try again.");
    });
}

// Add a click event listener to the download button
// When clicked, it will download the last analysis as a text file
// This uses the Blob and URL APIs to create a downloadable file in the browser
// The file will be named 'resume_analysis.txt'
document.getElementById("downloadBtn").addEventListener("click", function () {
  if (!lastAnalysisText) return; // If there is nothing to download, do nothing
  const blob = new Blob([lastAnalysisText], { type: "text/plain" });
  const url = URL.createObjectURL(blob); // Create a temporary URL for the blob
  const a = document.createElement("a"); // Create a temporary <a> element
  a.href = url;
  a.download = "resume_analysis.txt"; // Set the file name
  document.body.appendChild(a); // Add the <a> to the page
  a.click(); // Simulate a click to start download
  setTimeout(() => {
    document.body.removeChild(a); // Remove the <a> after download
    URL.revokeObjectURL(url); // Release the blob URL
  }, 0);
});

// === Theme Toggle ===
const themeToggle = document.getElementById("themeToggle");
if (themeToggle) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const storedTheme = localStorage.getItem("resume-theme");
  if (storedTheme) {
    document.documentElement.setAttribute("data-theme", storedTheme);
  } else if (prefersDark) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
  updateThemeIcon();
  themeToggle.addAttribute = false;
  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("resume-theme", next);
    updateThemeIcon();
  });
}

// === Example Section copy action ===
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="copy-example"]');
  if (!btn) return;
  const codeEl = btn.closest('[data-example-root]')?.querySelector('[data-code]');
  if (!codeEl) return;
  const text = codeEl.textContent || '';
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => flashBtn(btn,'Copied')).catch(()=> fallbackCopy(text, btn));
  } else {
    fallbackCopy(text, btn);
  }
});

function flashBtn(btn, text) {
  const original = btn.textContent;
  btn.textContent = text;
  btn.disabled = true;
  setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1100);
}

function fallbackCopy(text, btn) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position='fixed'; ta.style.top='-1000px';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    flashBtn(btn, 'Copied');
  } catch (_) {
    alert('Copy failed');
  }
}

function updateThemeIcon() {
  const iconSpan = document.querySelector("[data-theme-icon]");
  if (!iconSpan) return;
  const current = document.documentElement.getAttribute("data-theme");
  iconSpan.textContent = current === "dark" ? "🌞" : "🌙";
}

// === Drag & Drop for File Input ===
const fileInput = document.getElementById("resumeUpload");
const fileLabel = document.getElementById("fileLabel");

if (fileLabel && fileInput) {
  ["dragenter", "dragover"].forEach((evt) =>
    fileLabel.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      fileLabel.classList.add("dragging");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    fileLabel.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      fileLabel.classList.remove("dragging");
    })
  );
  fileLabel.addEventListener("drop", (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      fileInput.files = e.dataTransfer.files;
      fileLabel.querySelector(
        ".file-drop__text"
      ).innerHTML = `<strong>${e.dataTransfer.files[0].name}</strong>`;
    }
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) {
      fileLabel.querySelector(
        ".file-drop__text"
      ).innerHTML = `<strong>${fileInput.files[0].name}</strong>`;
    }
  });
  // Keyboard activation
  fileLabel.addEventListener("keypress", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
}

// Enhance download button initial state
const downloadBtnInitial = document.getElementById("downloadBtn");
if (downloadBtnInitial) {
  const observer = new MutationObserver(() => {
    if (downloadBtnInitial.classList.contains("show")) {
      downloadBtnInitial.removeAttribute("aria-disabled");
    } else {
      downloadBtnInitial.setAttribute("aria-disabled", "true");
    }
  });
  observer.observe(downloadBtnInitial, {
    attributes: true,
    attributeFilter: ["class"],
  });
}
