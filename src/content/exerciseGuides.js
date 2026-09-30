// Step-by-step instructions for each exercise. `t` is the point in the
// movement the step picture shows (0 = start position, 1 = end of the rep).

export const GUIDES = {
  squat: {
    muscles: "Quads, glutes, hamstrings, core",
    steps: [
      { t: 0, text: "Stand with your feet shoulder-width apart, toes turned out slightly." },
      { t: 0.5, text: "Push your hips back and bend your knees, keeping your chest up." },
      { t: 1, text: "Lower until your thighs are parallel to the floor, arms forward for balance." },
      { t: 0, text: "Drive through your heels to stand back up tall." },
    ],
    tips: ["Keep your knees in line with your toes", "Heels stay on the floor", "Breathe in on the way down, out on the way up"],
  },
  pushup: {
    muscles: "Chest, shoulders, triceps, core",
    steps: [
      { t: 0, text: "Start in a high plank: hands under your shoulders, body in a straight line." },
      { t: 0.5, text: "Bend your elbows, keeping them about 45° from your body." },
      { t: 1, text: "Lower until your chest is just above the floor." },
      { t: 0, text: "Push the floor away to straighten your arms." },
    ],
    tips: ["Squeeze your glutes so your hips don't sag", "Keep your neck in line with your spine", "Drop to your knees if you need to"],
  },
  lunge: {
    muscles: "Quads, glutes, hamstrings",
    steps: [
      { t: 0, text: "Stand tall with your feet hip-width apart." },
      { t: 0.5, text: "Take a big step forward and start lowering your hips." },
      { t: 1, text: "Lower until both knees are bent to about 90°, back knee just above the floor." },
      { t: 0, text: "Push through the front heel to return to standing. Alternate legs." },
    ],
    tips: ["Keep your torso upright", "Front knee stays over your ankle", "Keep your weight in the front heel"],
  },
  curl: {
    muscles: "Biceps, forearms",
    steps: [
      { t: 0, text: "Stand tall holding the weights, arms straight, palms facing forward." },
      { t: 0.5, text: "Keep your elbows pinned to your sides and bend at the elbow." },
      { t: 1, text: "Curl the weights up to your shoulders and squeeze." },
      { t: 0, text: "Lower slowly until your arms are straight again." },
    ],
    tips: ["Don't swing your body", "Control the way down", "Only your forearms should move"],
  },
  press: {
    muscles: "Shoulders, triceps, upper back",
    steps: [
      { t: 0, text: "Hold the weights at shoulder height, elbows under your wrists." },
      { t: 0.5, text: "Brace your core and press the weights straight up." },
      { t: 1, text: "Straighten your arms fully overhead." },
      { t: 0, text: "Lower back to shoulder height with control." },
    ],
    tips: ["Don't arch your lower back", "Keep your ribs down", "Press both arms at the same speed"],
  },
  lateral_raise: {
    muscles: "Side shoulders, upper back",
    steps: [
      { t: 0, text: "Stand tall with the weights by your sides, elbows slightly bent." },
      { t: 0.5, text: "Raise your arms out to the sides, leading with your elbows." },
      { t: 1, text: "Stop when your arms are level with your shoulders." },
      { t: 0, text: "Lower slowly back to your sides." },
    ],
    tips: ["Use light weights", "Don't shrug your shoulders", "No swinging"],
  },
  jumping_jack: {
    muscles: "Full body, cardio",
    steps: [
      { t: 0, text: "Stand with your feet together and arms by your sides." },
      { t: 0.5, text: "Jump your feet out while swinging your arms out to the sides." },
      { t: 1, text: "Land with feet wide and hands meeting overhead." },
      { t: 0, text: "Jump back to the start position and repeat." },
    ],
    tips: ["Land softly on the balls of your feet", "Keep a steady rhythm", "Step instead of jumping for low impact"],
  },
  glute_bridge: {
    muscles: "Glutes, hamstrings, core",
    steps: [
      { t: 0, text: "Lie on your back, knees bent, feet flat and close to your hips." },
      { t: 0.5, text: "Press through your heels and start lifting your hips." },
      { t: 1, text: "Lift until your body is straight from shoulders to knees. Squeeze your glutes." },
      { t: 0, text: "Lower your hips slowly back to the floor." },
    ],
    tips: ["Push through your heels, not your toes", "Don't over-arch your back at the top", "Pause for a second at the top"],
  },
  situp: {
    muscles: "Abs, hip flexors",
    steps: [
      { t: 0, text: "Lie on your back with knees bent and feet flat. Cross your arms over your chest." },
      { t: 0.5, text: "Tighten your abs and curl your upper body off the floor." },
      { t: 1, text: "Sit all the way up until your chest is close to your knees." },
      { t: 0, text: "Lower back down slowly, one vertebra at a time." },
    ],
    tips: ["Don't pull on your neck", "Keep your feet on the floor", "Breathe out as you come up"],
  },
  plank: {
    muscles: "Core, shoulders, glutes",
    steps: [
      { t: 0, text: "Place your forearms on the floor with elbows under your shoulders." },
      { t: 0, text: "Step your feet back so your body forms a straight line from head to heels." },
      { t: 0, text: "Squeeze your glutes and brace your core. Hold the position." },
    ],
    tips: ["Don't let your hips sag or pike up", "Look at the floor to keep your neck neutral", "Keep breathing steadily"],
  },
  high_knees: {
    muscles: "Hip flexors, quads, calves, cardio",
    steps: [
      { t: 0, text: "Stand tall with your feet hip-width apart." },
      { t: 0.5, text: "Start jogging on the spot, pumping your arms." },
      { t: 1, text: "Drive each knee up to hip height." },
      { t: 0, text: "Land softly on the balls of your feet and switch legs quickly." },
    ],
    tips: ["Stay tall, don't lean back", "Opposite arm to opposite knee", "March instead of jogging for low impact"],
  },
  butt_kicks: {
    muscles: "Hamstrings, calves, cardio",
    steps: [
      { t: 0, text: "Stand tall with your feet hip-width apart." },
      { t: 0.5, text: "Start jogging on the spot." },
      { t: 1, text: "Kick each heel up towards your glutes, keeping your knees pointing down." },
      { t: 0, text: "Switch legs quickly and keep a steady rhythm." },
    ],
    tips: ["Knees stay under your hips", "Stay light on your feet", "Swing your arms naturally"],
  },
  arm_circles: {
    muscles: "Shoulders, upper back",
    steps: [
      { t: 0, text: "Stand tall and raise your arms straight out to the sides at shoulder height." },
      { t: 0.25, text: "Make small forward circles with your hands." },
      { t: 0.75, text: "Gradually make the circles bigger." },
      { t: 0.5, text: "Halfway through, switch to backward circles." },
    ],
    tips: ["Keep your arms straight", "Relax your neck and shoulders", "Keep both arms at the same height"],
  },
  torso_twist: {
    muscles: "Obliques, lower back, core",
    steps: [
      { t: 0.5, text: "Stand with your feet shoulder-width apart, hands together at chest height." },
      { t: 0, text: "Rotate your upper body to one side, keeping your hips facing forward." },
      { t: 1, text: "Rotate smoothly to the other side." },
      { t: 0.5, text: "Keep twisting from side to side at a steady pace." },
    ],
    tips: ["Move from your waist, not your hips", "Stay tall", "Start slowly and build up the range"],
  },
  side_bend: {
    muscles: "Obliques, lats",
    steps: [
      { t: 0, text: "Stand tall with your feet hip-width apart." },
      { t: 0.5, text: "Raise one arm and start bending sideways the other way." },
      { t: 1, text: "Reach over your head as your other hand slides down the side of your leg." },
      { t: 0, text: "Come back up tall and repeat on the other side." },
    ],
    tips: ["Bend straight to the side, not forward", "Keep your hips still", "Breathe out as you bend"],
  },
  hip_hinge: {
    muscles: "Hamstrings, glutes, lower back",
    steps: [
      { t: 0, text: "Stand tall with your feet hip-width apart and a soft bend in your knees." },
      { t: 0.5, text: "Push your hips back as if closing a door behind you." },
      { t: 1, text: "Let your chest tip forward with a flat back until you feel your hamstrings stretch." },
      { t: 0, text: "Squeeze your glutes to stand back up tall." },
    ],
    tips: ["Keep your back flat", "Knees stay only slightly bent", "Move from your hips, not your lower back"],
  },
};

export function getGuide(exerciseId) {
  return GUIDES[exerciseId] ?? null;
}
