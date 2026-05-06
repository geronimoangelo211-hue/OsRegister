console.log("%cSTOP!", "color: red; font-size: 50px; font-weight: bold; font-family: sans-serif; text-shadow: 2px 2px 0 #000;");
console.log("%cBawal ka dito panget", "color: white; background: red; font-size: 16px; padding: 5px 10px; border-radius: 5px;");

const API_BASE_URL = "https://support-backend-ldos.onrender.com/api";
const COOLDOWN_TIME = 5 * 60 * 1000; // 5 minutes
let cooldownInterval;

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
    setTimeout(() => { msgEl.textContent = ''; }, 6000);
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

    if (gcHandle === 'Other') gcHandle = document.getElementById('stu-gc-other').value.trim();

    if (!name || !idNum || !gcHandle || !classLevel) {
        showMessage('Please fill in all required fields.', true);
        return;
    }

    if (selectedDays.length === 0) {
        showMessage('Please select at least one day for your schedule.', true);
        return;
    }

    btn.disabled = true;
    let dotCount = 1;
    btn.textContent = 'Registering.';
    
    const loadingInterval = setInterval(() => {
        dotCount = (dotCount % 3) + 1;
        btn.textContent = 'Registering' + '.'.repeat(dotCount);
    }, 400);

    let isSuccess = false;

    try {
        let serverStudents = [];
        
        // Step 1: Pull existing students ONLY for duplicate ID checking
        try {
            const syncRes = await fetch(`${API_BASE_URL}/sync/pull?nocache=${new Date().getTime()}`, { 
                cache: 'no-store',
                headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' }
            });
            
            if (syncRes.ok) {
                const syncData = await syncRes.json();
                
                // Load existing students safely
                if (syncData.students && syncData.students !== "[]" && syncData.students !== "null") {
                    let parsedStudents = syncData.students;
                    try { if (typeof parsedStudents === 'string') parsedStudents = JSON.parse(parsedStudents); } catch(e){}
                    try { if (typeof parsedStudents === 'string') parsedStudents = JSON.parse(parsedStudents); } catch(e){}
                    if (Array.isArray(parsedStudents)) serverStudents = parsedStudents;
                }
            }
        } catch (err) {
            console.warn("Network issue pulling students, proceeding anyway.");
        }

        // Step 2: Duplicate ID Check
        if (serverStudents.some(s => String(s.id).toLowerCase() === String(idNum).toLowerCase())) {
            showMessage('This Student ID is already registered!', true);
            return; 
        }

        // Step 3: Add the new student
        serverStudents.push({
            name: name,
            id: idNum,
            classLevel: classLevel,
            gcHandle: gcHandle,
            assignedDays: selectedDays 
        });

        // Step 4: Push updated list to Cloud
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
                document.getElementById('registrationForm').style.display = 'none';
                document.getElementById('success-modal').style.display = 'flex';
                document.getElementById('registrationForm').reset();
                document.getElementById('stu-gc-other').style.display = 'none';
                localStorage.setItem('registration_cooldown_time', Date.now());
                startCooldownTimer();
            } else {
                showMessage(data.message || 'Error saving registration.', true);
            }
        } else {
            showMessage('Server error. Please try again later.', true);
        }

    } catch (error) {
        showMessage('Network Error, Please check your connection.', true);
    } finally {
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
