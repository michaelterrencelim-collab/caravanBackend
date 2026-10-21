// checks if user Logged in; if so, change login to profile
async function updateNavbarLogin(){

    const response = await fetch("/api/isLoggedIn");

        if(!response.ok){
    document.getElementById("accountButton").innerHTML = `
        <a class="nav-link" href="/login">Login</a>
    `;
        }else{
            document.getElementById("accountButton").innerHTML = `
        <a class="nav-link" href="/user/profile">Profile</a>
    `;
        }

}
updateNavbarLogin();

document.querySelectorAll('.faq-question').forEach((question) => {
	question.addEventListener('click', () => {
		const selectedItem = question.closest('.faq-item');
		const shouldOpen = !selectedItem.classList.contains('is-open');

		document.querySelectorAll('.faq-item').forEach((item) => {
			item.classList.remove('is-open');
			item.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
		});

		if (shouldOpen) {
			selectedItem.classList.add('is-open');
			question.setAttribute('aria-expanded', 'true');
		}
	});
});
