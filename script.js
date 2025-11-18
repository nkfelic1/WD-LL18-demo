// --- DOM elements ---
const randomBtn = document.getElementById("random-btn");
const recipeDisplay = document.getElementById("recipe-display");
const remixBtn = document.getElementById("remix-btn");
const remixTheme = document.getElementById("remix-theme");
const remixOutput = document.getElementById("remix-output");

// Keep the most recently fetched recipe so the remix function can use it
let currentRecipe = null;

// This function creates a list of ingredients for the recipe from the API data
// It loops through the ingredients and measures, up to 20, and returns an HTML string
// that can be used to display them in a list format
// If an ingredient is empty or just whitespace, it skips that item 
function getIngredientsHtml(recipe) {
  let html = "";
  for (let i = 1; i <= 20; i++) {
    const ing = recipe[`strIngredient${i}`];
    const meas = recipe[`strMeasure${i}`];
    if (ing && ing.trim()) html += `<li>${meas ? `${meas} ` : ""}${ing}</li>`;
  }
  return html;
}

// This function displays the recipe on the page
function renderRecipe(recipe) {
  recipeDisplay.innerHTML = `
    <div class="recipe-title-row">
      <h2>${recipe.strMeal}</h2>
    </div>
    <img src="${recipe.strMealThumb}" alt="${recipe.strMeal}" />
    <h3>Ingredients:</h3>
    <ul>${getIngredientsHtml(recipe)}</ul>
    <h3>Instructions:</h3>
    <p>${recipe.strInstructions.replace(/\r?\n/g, "<br>")}</p>
  `;
}

// This function gets a random recipe from the API and shows it
async function fetchAndDisplayRandomRecipe() {
  recipeDisplay.innerHTML = "<p>Loading...</p>"; // Show loading message
  try {
    // Fetch a random recipe from the MealDB API
    const res = await fetch('https://www.themealdb.com/api/json/v1/1/random.php'); 
    const data = await res.json(); // Parse the JSON response
    const recipe = data.meals[0]; // Get the first recipe from the response
    currentRecipe = recipe; // store for remixing
    renderRecipe(recipe); // Display the recipe on the page

  } catch (error) {
    recipeDisplay.innerHTML = "<p>Sorry, couldn't load a recipe.</p>";
  }
}


// --- Event listeners ---

// When the button is clicked, get and show a new random recipe
randomBtn.addEventListener("click", fetchAndDisplayRandomRecipe);


// When the page loads, show a random recipe right away
window.addEventListener("load", fetchAndDisplayRandomRecipe); // could also do document.addEventListener("DOMContentLoaded", fetchAndDisplayRandomRecipe);


// This function sends the raw recipe JSON and a chosen remix theme to OpenAI's
// Chat Completions API and displays the short, fun, doable remix result.
async function remixCurrentRecipe() {
  if (!currentRecipe) {
    remixOutput.innerHTML = "<p>No recipe loaded to remix. Try 'Surprise Me Again!' first.</p>";
    return;
  }

  const theme = remixTheme?.value || "Give it a fun twist";
  remixOutput.innerHTML = "<p>Remixing your recipe...</p>";

  try {
    // Build the messages for the Chat Completions API and request JSON-only output
    const messages = [
      {
        role: "system",
        content: `You are a playful, concise chef assistant. Return ONLY a JSON object (no extra commentary) with this exact shape:\n{\n  "title": string,\n  "ingredients": [{ "name": string, "measure": string, "changed": boolean }],\n  "instructions": string,\n  "note": string\n}\nMake sure ingredients list contains the final ingredients (with measures) and set \"changed\": true for any ingredient you replaced/adjusted. Keep the instructions short and doable.`
      },
      {
        role: "user",
        content: `Remix theme: ${theme}\n\nHere is the raw recipe JSON from TheMealDB. Produce the JSON described above for a short remixed recipe.`
      },
      {
        role: "user",
        content: JSON.stringify(currentRecipe)
      }
    ];

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({ model: "gpt-4.1", messages, temperature: 0.7, max_tokens: 600 })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`OpenAI error: ${resp.status} ${errText}`);
    }

    const data = await resp.json();
    const aiMessage = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || "";

    // Try to parse JSON from the assistant. Many assistants wrap JSON in backticks
    let parsed = null;
    try {
      parsed = JSON.parse(aiMessage);
    } catch (e) {
      // attempt to extract JSON substring
      const start = aiMessage.indexOf("{");
      const end = aiMessage.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        const maybe = aiMessage.substring(start, end + 1);
        try { parsed = JSON.parse(maybe); } catch (e2) { parsed = null; }
      }
    }

    if (parsed && typeof parsed === "object") {
      // Render the parsed remix using the same visual structure as the original recipe
      remixOutput.innerHTML = "";

      const container = document.createElement("div");

      const titleRow = document.createElement("div");
      titleRow.className = "recipe-title-row";
      const h2 = document.createElement("h2");
      h2.textContent = parsed.title || (currentRecipe && currentRecipe.strMeal) || "Remixed Recipe";
      titleRow.appendChild(h2);
      container.appendChild(titleRow);

      // (image intentionally omitted for remixed recipe)

      const h3Ing = document.createElement("h3");
      h3Ing.textContent = "Ingredients:";
      container.appendChild(h3Ing);

      const ul = document.createElement("ul");
      if (Array.isArray(parsed.ingredients)) {
        parsed.ingredients.forEach(it => {
          const li = document.createElement("li");
          const measure = it.measure ? `${it.measure} ` : "";
          const name = it.name || "";
          li.textContent = `${measure}${name}`;
          if (it.changed) {
            const note = document.createElement("strong");
            note.textContent = " (changed)";
            li.appendChild(note);
          }
          ul.appendChild(li);
        });
      }
      container.appendChild(ul);

      const h3Inst = document.createElement("h3");
      h3Inst.textContent = "Instructions:";
      container.appendChild(h3Inst);

      const p = document.createElement("p");
      // escape any HTML then convert newlines to <br>
      const escape = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      p.innerHTML = (parsed.instructions ? escape(parsed.instructions) : "").replace(/\r?\n/g, "<br>");
      container.appendChild(p);

      if (parsed.note) {
        const noteEl = document.createElement("p");
        noteEl.style.fontStyle = "italic";
        noteEl.textContent = parsed.note;
        container.appendChild(noteEl);
      }

      remixOutput.appendChild(container);

      // mark todo completed for rendering task
      try { /* best-effort: update todo list to completed */ } catch (e) {}

    } else {
      // fallback: show raw AI text
      remixOutput.innerHTML = "";
      const pre = document.createElement("pre");
      pre.textContent = aiMessage.trim() || "(no response)";
      remixOutput.appendChild(pre);
      const msg = document.createElement("p");
      msg.textContent = "The assistant replied in an unexpected format — showing the response below.";
      remixOutput.appendChild(msg);
    }

  } catch (err) {
    console.error("Remix request failed:", err);
    // Friendly message for users when something goes wrong with the AI request
    remixOutput.innerHTML = "<p>Oops — we couldn't get a remix right now. Please try again in a moment.</p>";
  }
}

// Wire the Remix button
if (remixBtn) remixBtn.addEventListener("click", remixCurrentRecipe);