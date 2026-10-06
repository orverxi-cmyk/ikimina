const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/app/login/page.tsx');
let code = fs.readFileSync(file, 'utf-8');

// 1. In handleCheckEmail, change what happens if querySnapshot.empty
code = code.replace(
  `      if (querySnapshot.empty) {
        setEmail(normalizedEmail);
        setStep('register');
        toast({ 
          title: "New Member Registration", 
          description: "No registered profile found for this email. Please fill in your details below." 
        });
        return;
      }`,
  `      if (querySnapshot.empty) {
        toast({ 
          variant: "destructive",
          title: "Account Not Found", 
          description: "Your email is not registered in the system. Please contact an administrator to create your membership profile." 
        });
        return;
      }`
);

// 2. Remove handleRegister completely
// We can use a regex to remove handleRegister
code = code.replace(/const handleRegister = async \([^)]*\) => \{[\s\S]*?\};\n/, '');

// 3. Remove the step === 'register' block from UI
// It starts with `{/* STEP 4: SELF-REGISTRATION FOR NEW MEMBER */}` and ends before `{/* STEP 5: PENDING ADMINISTRATOR ACTIVATION SCREEN */}`
code = code.replace(
  /\{\/\* STEP 4: SELF-REGISTRATION FOR NEW MEMBER \*\/\}[\s\S]*?(?=\{\/\* STEP 5: PENDING ADMINISTRATOR ACTIVATION SCREEN \*\/})/,
  ''
);

fs.writeFileSync(file, code);
console.log('Removed self registration!');
