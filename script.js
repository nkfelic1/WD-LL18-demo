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
    // Build the messages for the Chat Completions API
    const messages = [
      {
        role: "system",
          content: "You are a playful, concise chef assistant. Produce a short, fun, creative, and totally doable remix of the provided recipe. Clearly highlight any changed ingredients and any changed cooking steps. Keep the result practical and easy to follow. IMPORTANT: Respond with JSON ONLY and nothing else. The JSON must follow this schema:\n{\n  \"title\": string,\n  \"ingredients\": [ { \"name\": string, \"amount\": string, \"changed\": boolean, \"note\": string }, ... ],\n  \"instructions\": string,\n  \"note\": string\n}\nDo not add any explanatory text outside the JSON."
      },
      {
        role: "user",
          content: `Remix theme: ${theme}\n\nHere is the raw recipe JSON from TheMealDB. Produce a remixed recipe following the exact JSON schema provided by the system message. Keep it short and doable.`
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
      body: JSON.stringify({
        model: "gpt-4.1",
        messages,
        temperature: 0.8,
        max_tokens: 400
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`OpenAI error: ${resp.status} ${errText}`);
    }

    const data = await resp.json();
    const aiMessage = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || "(no response)";
    // Try to extract JSON from the assistant response (strip fences if present)
    let jsonText = aiMessage.trim();
    // If wrapped in triple-backtick code block, extract the contents
    const fenceMatch = jsonText.match(/```(?:json)?\n([\s\S]*?)\n```/i);
    if (fenceMatch) jsonText = fenceMatch[1].trim();
    else {
      // Otherwise try to find the first {...} block
      const first = jsonText.indexOf('{');
      const last = jsonText.lastIndexOf('}');
      if (first !== -1 && last !== -1) jsonText = jsonText.slice(first, last + 1);
    }

    let parsed = null;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      parsed = null;
    }

    if (parsed && typeof parsed === 'object') {
      // Render structured HTML
      remixOutput.innerHTML = '';

      const title = document.createElement('h3');
      title.textContent = parsed.title || (currentRecipe && currentRecipe.strMeal ? currentRecipe.strMeal + ' (remix)' : 'Remixed Recipe');
      remixOutput.appendChild(title);

      if (parsed.note) {
        const noteP = document.createElement('p');
        noteP.innerHTML = `<strong>Note:</strong> ${parsed.note}`;
        remixOutput.appendChild(noteP);
      }

      if (Array.isArray(parsed.ingredients)) {
        const ingH4 = document.createElement('h4');
        ingH4.textContent = 'Ingredients:';
        remixOutput.appendChild(ingH4);

        const ul = document.createElement('ul');
        parsed.ingredients.forEach((it) => {
          const li = document.createElement('li');
          const amount = it.amount ? (it.amount + ' ') : '';
          const name = it.name || '';
          if (it.changed) {
            // highlight changed ingredients
            li.innerHTML = `<mark>${amount}${name}${it.note ? ' — ' + it.note : ''}</mark>`;
          } else {
            li.textContent = `${amount}${name}${it.note ? ' — ' + it.note : ''}`;
          }
          ul.appendChild(li);
        });
        remixOutput.appendChild(ul);
      }

      if (parsed.instructions) {
        const instrH4 = document.createElement('h4');
        instrH4.textContent = 'Instructions:';
        remixOutput.appendChild(instrH4);

        const p = document.createElement('p');
        p.innerHTML = parsed.instructions.replace(/\r?\n/g, '<br>');
        remixOutput.appendChild(p);
      }

    } else {
      // Fallback: show raw text if JSON parsing failed
      remixOutput.innerHTML = '';
      const warn = document.createElement('p');
      warn.innerHTML = '<strong>Could not parse AI JSON response — showing raw output:</strong>';
      remixOutput.appendChild(warn);
      const pre = document.createElement('pre');
      pre.textContent = aiMessage.trim();
      remixOutput.appendChild(pre);
    }

  } catch (err) {
    console.error(err);
    remixOutput.innerHTML = `<p>Sorry — couldn't remix the recipe. ${err.message}</p>`;
  }
}

// Wire the Remix button
if (remixBtn) remixBtn.addEventListener("click", remixCurrentRecipe);