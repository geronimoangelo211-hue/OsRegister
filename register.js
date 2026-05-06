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
    let dotCount = 1;
    btn.textContent = 'Registering.';
    
    const loadingInterval = setInterval(() => {
        dotCount = (dotCount % 3) + 1; // Cycles 1, 2, 3
        btn.textContent = 'Registering' + '.'.repeat(dotCount);
    }, 400); // 400ms update speed

    let isSuccess = false;

    try {
        // 1. Check Lock Status & Grab Students using the New Master Sync Engine
        let serverStudents = [];
        try {
            // FIX: Added { cache: 'no-store' } to force the browser to read the LIVE lock status, not the cached memory!
            const syncRes = await fetch(`${API_BASE_URL}/sync/pull`, { cache: 'no-store' });
            
            if (syncRes.ok) {
                const syncData = await syncRes.json();
                
                // A. Verify Registration is Open
                let configObj = { regOpen: false }; // Defaults to closed for security
                if (syncData.config && syncData.config !== "{}" && syncData.config !== "null") {
                    configObj = JSON.parse(syncData.config);
                }
                
                // FIX: Added a check for both boolean and string just in case it saves weirdly
                if (configObj.regOpen !== true && configObj.regOpen !== "true") {
                    showMessage('Registration is currently closed by the Admin.', true);
                    return; 
                }
                
                // B. Load active students for duplicate checking
                if (syncData.students && syncData.students !== "[]" && syncData.students !== "null") {
                    serverStudents = JSON.parse(syncData.students);
                }
            }
        } catch (err) {
            showMessage('Network error while checking server status.', true);
            return;
        }

        // 2. Duplicate ID Check
        if (serverStudents.some(s => String(s.id).toLowerCase() === String(idNum).toLowerCase())) {
            showMessage('This Student ID is already registered!', true);
            return; 
        }

        // 3. Prepare the new student payload
        serverStudents.push({
            name: name,
            id: idNum,
            classLevel: classLevel,
            gcHandle: gcHandle,
            assignedDays: selectedDays 
        });

        // 4. Save directly to the new Cloud Sync Engine!
        const response = await fetch(`${API_BASE_URL}/sync/push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                students: JSON.stringify(serverStudents) 
            }) 
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
            showMessage('Server closed. Please try again later.', true);
        }

    } catch (error) {
        showMessage('Network Error, Please try again', true);
    } finally {
        // Stop the text animation loop
        clearInterval(loadingInterval);

        if (isSuccess) {
            btn.textContent = 'REGISTERED ✔';
            btn.style.backgroundColor = 'var(--success)';
            btn.style.color = '#000';
        } else {
            btn.disabled = false;
            btn.textContent = 'REGISTER NOW';
        }
    }
});
