// Runs before content paints; missing or legacy preferences default to light.
export const themeScript = `(function(){var p="light";try{if(localStorage.getItem("mme-theme")==="dark")p="dark";}catch(e){}document.documentElement.dataset.theme=p;document.documentElement.dataset.themePreference=p;document.documentElement.style.colorScheme=p;})();`;
