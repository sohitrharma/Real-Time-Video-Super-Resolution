function sendEmail() {
    const email = document.getElementById('emailInput').value.trim();
    const callId = document.getElementById('callInput').value;

    if (!email || !callId) {
        alert('Please enter both an email address and a call ID.');
        return;
    }

    if (!validateEmail(email)) {
        alert('Please enter a valid email address.');
        return;
    }

    const templateParams = {
        user_email: email,
        call_id: callId
    };

    emailjs.send('service_70zl44p', 'callID_243304u', templateParams)
        .then(function (response) {
            console.log('SUCCESS!', response.status, response.text);
            alert('Email sent successfully!');
            document.getElementById('emailInput').value = '';
        }, function (error) {
            console.log('FAILED...', error);
            alert('Failed to send email: ' + JSON.stringify(error));
        });
}

function validateEmail(email) {
    const re = /\S+@\S+\.\S+/;
    return re.test(String(email).toLowerCase());
}
