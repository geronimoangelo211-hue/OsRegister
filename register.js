console.log("%cSTOP!", "color: red; font-size: 50px; font-weight: bold; font-family: sans-serif; text-shadow: 2px 2px 0 #000;");
console.log("%cBawal ka dito panget", "color: white; background: red; font-size: 16px; padding: 5px 10px; border-radius: 5px;");

const API_BASE_URL = "https://support-backend-ldos.onrender.com/api";
const COOLDOWN_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds
let cooldownInterval;

// On Page Load: Check if user is in cooldown
document.addEventListener('DOMContentLoaded', () => {
    startCooldownTimer();
});

function toggleOther(val) {
    const otherInput = document.getElementById('stu-gc-other');
    if (val === 'Other') {
        otherInput.style.display = 'block';
        otherInput.required = true;
    } else {
        otherInput.style.display = 'none';
        otherInput.required = false;
        otherInput.value = '';
    }
}

function showMessage(text, isError) {
    const msgEl = document.getElementById('statusMessage');
    msgEl.textContent = text;
    msgEl.className = 'message ' + (isError ? 'error' : 'success');
    
    // Clear message after 5 seconds
    setTimeout(() => { msgEl.textContent = ''; }, 5000);
}

function closeModal() {
    document.getElementById('success-modal').style.display = 'none';
    // Optionally un-hide the form if they close it, though they are technically done.
    document.getElementById('registrationForm').style.display = 'block';
}

function startCooldownTimer() {
    const lastReg = localStorage.getItem('registration_cooldown_time');
    if (!lastReg) return;
    
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    
    clearInterval(cooldownInterval);
    cooldownInterval = setInterval(() => {
        const timePassed = Date.now() - parseInt(lastReg);
        const timeLeft = COOLDOWN_TIME - timePassed;
        
        if (timeLeft <= 0) {
            clearInterval(cooldownInterval);
            localStorage.removeItem('registration_cooldown_time');
            btn.disabled = false;
            btn.textContent = 'REGISTER NOW';
        } else {
            const mins = Math.floor(timeLeft / 60000);
            const secs = Math.floor((timeLeft % 60000) / 1000);
            btn.textContent = `COOLDOWN (${mins}:${secs.toString().padStart(2, '0')})`;
        }
    }, 1000);
}

document.getElementById('registrationForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const btn = document.getElementById('submitBtn');
    
    // Failsafe check
    if (localStorage.getItem('registration_cooldown_time')) {
        const timePassed = Date.now() - parseInt(localStorage.getItem('registration_cooldown_time'));
        if (timePassed < COOLDOWN_TIME) {
            showMessage('Please wait for the cooldown to expire before registering again.', true);
            return;
        }
    }

    const name = document.getElementById('stu-name').value.trim();
    const idNum = document.getElementById('stu-id').value.trim();
    const classLevel = document.getElementById('stu-class').value;
    let gcHandle = document.getElementById('stu-gc').value;
    const selectedDays = Array.from(document.querySelectorAll('.day-checkbox:checked')).map(cb => cb.value);

    if (gcHandle === 'Other') {
        gcHandle = document.getElementById('stu-gc-other').value.trim();
    }

    if (!name || !idNum || !gcHandle || !classLevel) {
        showMessage('Please fill in all required fields.', true);
        return;
    }

    if (selectedDays.length === 0) {
        showMessage('Please select at least one day for your schedule.', true);
        return;
    }

    // Immediately lock button to prevent double-clicks
    btn.disabled = true;
    btn.textContent = 'SUBMITTING...';

    let isSuccess = false;

    try {
        // 1. Check Lock Status
        try {
            const configRes = await fetch(`${API_BASE_URL}/config/status`);
            if (configRes.ok) {
                const config = await configRes.json();
                if (config.isLocked) {
                    showMessage('Registration is currently closed by the Admin.', true);
                    return; 
                }
            }
        } catch (err) {
            console.warn("Could not check lock status, proceeding anyway.");
        }

        // 2. Duplicate ID Check
        const checkRes = await fetch(`${API_BASE_URL}/students`);
        if (checkRes.ok) {
            const existingStudents = await checkRes.json();
            
            // Look for matching ID (case-insensitive)
            if (existingStudents.some(s => String(s.id).toLowerCase() === String(idNum).toLowerCase())) {
                showMessage('This Student ID is already registered!', true);
                return; 
            }
        }

        const payload = {
            name: name,
            id: idNum,
            classLevel: classLevel,
            gcHandle: gcHandle,
            assignedDays: selectedDays 
        };

        // 3. Post to backend
        const response = await fetch(`${API_BASE_URL}/students`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                isSuccess = true;
                
                // Hide the Registration Form and show the GIF Modal
                document.getElementById('registrationForm').style.display = 'none';
                document.getElementById('success-modal').style.display = 'flex';
                
                // Clear Form silently in the background
                document.getElementById('registrationForm').reset();
                document.getElementById('stu-gc-other').style.display = 'none';
                
                // Trigger Cooldown
                localStorage.setItem('registration_cooldown_time', Date.now());
                startCooldownTimer();
            } else {
                showMessage(data.message || 'Error saving registration.', true);
            }
        } else {
            showMessage('Server error. Please try again later.', true);
        }

    } catch (error) {
        showMessage('Network error. Unable to connect to server.', true);
    } finally {
        if (!isSuccess) {
            btn.disabled = false;
            btn.textContent = 'REGISTER NOW';
        }
    }
});
