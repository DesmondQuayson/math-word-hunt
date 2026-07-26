/* =====================================================================
   MATH WORD HUNT — CURRICULUM DATA
   Grades 6 & 7 | St. Louis Public Schools 2025-26 pacing
   ---------------------------------------------------------------------
   ARCHITECTURE
   TERMS      = one entry per unique term. Definition lives here ONLY.
   CURRICULUM = grade > topic > lesson > array of term keys.

   A term used in six lessons is defined once and referenced six times.
   Fix a typo in one place and it fixes everywhere.

   TERM FIELDS
     d   definition (student-facing, shown on find)
     e   worked example / memory hook (optional, shown under definition)
     x   true = cannot be placed in a letter grid (contains digits or
         collides with another term when stripped to letters).
         These still appear as bonus clue cards, never in the grid.

   GRID FORM is derived automatically: uppercase, strip everything that
   is not A-Z. "x-axis" -> XAXIS. "Part-to-Part" -> PARTTOPART.

   >>> TEACHER REVIEW REQUIRED <<<
   Definitions were drafted for 6th/7th grade reading level and have NOT
   been verified against Savvas or DESE wording. Review before classroom
   use. This is the single highest-risk file in the project.
   ===================================================================== */

const TERMS = {

  /* ---------- NUMBER & OPERATIONS ---------- */
  "Addend":              { d: "A number being added in an addition problem.", e: "In 7 + 5 = 12, both 7 and 5 are addends." },
  "Sum":                 { d: "The answer to an addition problem.", e: "The sum of 7 and 5 is 12." },
  "Difference":          { d: "The answer to a subtraction problem.", e: "The difference of 12 and 5 is 7." },
  "Product":             { d: "The answer to a multiplication problem.", e: "The product of 4 and 6 is 24." },
  "Quotient":            { d: "The answer to a division problem.", e: "The quotient of 24 and 6 is 4." },
  "Dividend":            { d: "The number being divided.", e: "In 24 ÷ 6, the dividend is 24." },
  "Divisor":             { d: "The number you are dividing by.", e: "In 24 ÷ 6, the divisor is 6." },
  "Remainder":           { d: "The amount left over when a number does not divide evenly.", e: "25 ÷ 4 = 6 with a remainder of 1." },
  "Long Division":       { d: "A step-by-step method for dividing larger numbers.", e: "Divide, multiply, subtract, bring down — repeat." },
  "Decimal":             { d: "A number that uses a decimal point to show parts of a whole.", e: "3.75 is three and seventy-five hundredths." },
  "Decimal Point":       { d: "The dot that separates whole numbers from parts of a whole.", e: "In 3.75, the dot after the 3." },
  "Decimal Quotient":    { d: "A quotient written as a decimal instead of using a remainder.", e: "25 ÷ 4 = 6.25 instead of 6 R1." },
  "Place Value":         { d: "The value a digit has because of its position in a number.", e: "In 3.75, the 7 is in the tenths place." },
  "Regroup":             { d: "To trade between place values when adding or subtracting.", e: "Carrying a ten, or borrowing from the tens place." },
  "Estimate":            { d: "To find an answer close to the exact one, to check reasonableness.", e: "4.9 × 6.1 is about 5 × 6 = 30." },
  "Compatible Numbers":  { d: "Numbers that are easy to compute with mentally.", e: "For 247 ÷ 6, use 240 ÷ 6 = 40." },
  "Operation":           { d: "A math action: add, subtract, multiply, or divide." },
  "Multi-Step Problem":  { d: "A problem that requires more than one operation to solve." },
  "Convert":             { d: "To rewrite a number or measure in a different form.", e: "Convert 1/2 to 0.5 or to 50%." },
  "Multiply":            { d: "To find the total of equal groups.", e: "4 groups of 6 is 4 × 6 = 24." },
  "Divide":              { d: "To split into equal groups or find how many groups fit." },
  "Addition":            { d: "The operation of combining amounts." },
  "Subtraction":         { d: "The operation of taking one amount away from another." },
  "Multiplication":      { d: "The operation of repeated addition of equal groups." },
  "Division":            { d: "The operation of splitting into equal groups." },
  "Mental Math":         { d: "Solving a problem in your head without paper or a calculator." },
  "Reasonable Answer":   { d: "An answer that makes sense when you check it against an estimate." },
  "Check":               { d: "To substitute your answer back in to confirm it works." },

  /* ---------- FRACTIONS ---------- */
  "Fraction":            { d: "A number showing part of a whole, written as one number over another.", e: "3/4 means 3 of 4 equal parts." },
  "Numerator":           { d: "The top number in a fraction; how many parts you have.", e: "In 3/4, the numerator is 3." },
  "Denominator":         { d: "The bottom number in a fraction; how many equal parts the whole is split into.", e: "In 3/4, the denominator is 4." },
  "Unit Fraction":       { d: "A fraction with 1 as the numerator.", e: "1/2, 1/3, and 1/8 are unit fractions." },
  "Mixed Number":        { d: "A whole number and a fraction written together.", e: "2 1/3 means 2 wholes plus one third." },
  "Improper Fraction":   { d: "A fraction whose numerator is greater than or equal to its denominator.", e: "7/3 is the improper form of 2 1/3." },
  "Complex Fraction":    { d: "A fraction that has a fraction in its numerator, denominator, or both.", e: "(1/2) ÷ (3/4) written as a stacked fraction." },
  "Equivalent Fraction": { d: "Fractions that name the same amount.", e: "1/2, 2/4, and 50/100 are equivalent." },
  "Reciprocal":          { d: "The flip of a fraction; multiplying a number by its reciprocal gives 1.", e: "The reciprocal of 3/4 is 4/3." },
  "Fraction Model":      { d: "A drawing such as a bar or circle used to picture a fraction." },
  "Equal Groups":        { d: "Groups that each contain the same number of items." },
  "Simplify":            { d: "To rewrite in the simplest form using the smallest possible numbers.", e: "6/8 simplifies to 3/4." },

  /* ---------- INTEGERS & RATIONAL NUMBERS ---------- */
  "Integer":             { d: "A whole number, its opposite, or zero — never a fraction.", e: "-3, 0, and 12 are integers. 2.5 is not." },
  "Integers":            { d: "The whole numbers, their opposites, and zero.", e: "... -2, -1, 0, 1, 2 ..." },
  "Positive Integer":    { d: "An integer greater than zero." },
  "Positive Integers":   { d: "Integers greater than zero." },
  "Negative Integer":    { d: "An integer less than zero." },
  "Negative Integers":   { d: "Integers less than zero." },
  "Positive":            { d: "Greater than zero; to the right of zero on a number line." },
  "Negative":            { d: "Less than zero; to the left of zero on a number line." },
  "Zero":                { d: "The number that is neither positive nor negative; the origin of the number line." },
  "Opposite":            { d: "A number the same distance from zero but on the other side.", e: "The opposite of -7 is 7." },
  "Opposite Integers":   { d: "Two integers the same distance from zero in opposite directions.", e: "-5 and 5." },
  "Whole Number":        { d: "A counting number or zero, with no fraction or negative part.", e: "0, 1, 2, 3 ..." },
  "Whole Numbers":       { d: "The counting numbers together with zero." },
  "Rational Number":     { d: "Any number that can be written as a fraction of two integers.", e: "-3, 0.25, and 2/5 are all rational." },
  "Rational Numbers":    { d: "Numbers that can be written as a ratio of two integers." },
  "Number Line":         { d: "A line with numbers marked in order, used to compare and locate values." },
  "Absolute Value":      { d: "A number's distance from zero, always positive.", e: "|-8| = 8 and |8| = 8." },
  "Distance":            { d: "How far apart two points are; never negative." },
  "Additive Inverse":    { d: "The number you add to get zero.", e: "The additive inverse of 6 is -6." },
  "Additive Inverses":   { d: "Two numbers whose sum is zero.", e: "6 and -6 are additive inverses." },
  "Reciprocals":         { d: "Two numbers whose product is 1; also called multiplicative inverses.", e: "3/4 and 4/3." },
  "Same Signs":          { d: "When both numbers are positive or both are negative." },
  "Different Signs":     { d: "When one number is positive and the other is negative." },
  "Same":                { d: "Identical in sign or value." },
  "Different":           { d: "Not the same in sign or value." },
  "Greater":             { d: "Larger in value; farther right on the number line." },
  "Less":                { d: "Smaller in value; farther left on the number line." },
  "Repeating Decimal":   { d: "A decimal with a digit or group of digits that repeats forever.", e: "1/3 = 0.333..." },
  "Terminating Decimal": { d: "A decimal that ends.", e: "1/4 = 0.25" },
  "Decimal Expression":  { d: "An expression written using decimal numbers." },
  "Equivalent Decimal":  { d: "Decimals that name the same value.", e: "0.5 and 0.50" },
  "Rational Expression": { d: "An expression that contains rational numbers." },
  "Coordinate":          { d: "A number that gives the position of a point on a line or grid." },
  "Graph":               { d: "A visual display of data or of points on a coordinate plane." },
  "Plot":                { d: "To mark a point at a given location." },
  "Units":               { d: "The equal spaces or measures used on a number line or ruler." },

  /* ---------- COORDINATE PLANE & GEOMETRY (G6) ---------- */
  "Coordinate Plane":    { d: "A grid made by a horizontal and a vertical number line crossing at zero." },
  "Ordered Pair":        { d: "Two numbers (x, y) that locate a point on the coordinate plane.", e: "(3, -2) means right 3, down 2." },
  "Ordered Pairs":       { d: "Number pairs (x, y) that locate points on a grid." },
  "Origin":              { d: "The point (0, 0) where the axes cross." },
  "Quadrant":            { d: "One of the four regions of the coordinate plane." },
  "Axis":                { d: "A number line on a graph, either horizontal or vertical." },
  "x-axis":              { d: "The horizontal number line on the coordinate plane." },
  "y-axis":              { d: "The vertical number line on the coordinate plane." },
  "x-coordinate":        { d: "The first number in an ordered pair; how far left or right." },
  "y-coordinate":        { d: "The second number in an ordered pair; how far up or down." },
  "Horizontal Distance": { d: "The left-right distance between two points." },
  "Vertical Distance":   { d: "The up-down distance between two points." },
  "Polygon":             { d: "A closed flat shape made of straight sides.", e: "Triangles, squares, and pentagons." },
  "Vertex":              { d: "A corner point where sides or edges meet." },
  "Side":                { d: "One straight edge of a polygon." },
  "Translation":         { d: "A slide of a figure without turning or flipping it." },
  "Reflection":          { d: "A flip of a figure across a line, making a mirror image." },
  "Congruent":           { d: "Exactly the same size and shape." },

  /* ---------- EXPONENTS, FACTORS, EXPRESSIONS ---------- */
  "Exponent":            { d: "Shows how many times the base is multiplied by itself.", e: "In 5³, the exponent is 3." },
  "Base":                { d: "The number being multiplied repeatedly in a power.", e: "In 5³, the base is 5." },
  "Power":               { d: "A base raised to an exponent.", e: "5³ is a power; it equals 125." },
  "Squared":             { d: "Raised to the second power.", e: "6 squared is 36." },
  "Cubed":               { d: "Raised to the third power.", e: "4 cubed is 64." },
  "Expanded Form":       { d: "A number or expression written out as a sum or repeated product.", e: "5³ expanded is 5 × 5 × 5." },
  "Standard Form":       { d: "The usual compact way of writing a number.", e: "5 × 5 × 5 in standard form is 125." },
  "Factor":              { d: "A number that divides evenly into another number.", e: "1, 2, 3, and 6 are factors of 6." },
  "Factors":             { d: "Numbers multiplied together to make a product." },
  "Multiple":            { d: "The product of a number and any whole number.", e: "Multiples of 4: 4, 8, 12, 16 ..." },
  "Prime Number":        { d: "A number greater than 1 with exactly two factors: 1 and itself.", e: "2, 3, 5, 7, 11 ..." },
  "Composite Number":    { d: "A number with more than two factors.", e: "12 has factors 1, 2, 3, 4, 6, 12." },
  "Prime Factorization": { d: "Writing a number as a product of prime numbers only.", e: "12 = 2 × 2 × 3" },
  "Greatest Common Factor": { d: "The largest factor two or more numbers share.", e: "The GCF of 12 and 18 is 6." },
  "Least Common Multiple":  { d: "The smallest multiple two or more numbers share.", e: "The LCM of 4 and 6 is 12." },
  "Numerical Expression":{ d: "A math phrase with only numbers and operations — no equal sign.", e: "3 × (4 + 2)" },
  "Algebraic Expression":{ d: "A math phrase that includes at least one variable.", e: "3x + 7" },
  "Expression":          { d: "A math phrase with numbers, variables, and operations but no equal sign." },
  "Equivalent Expression": { d: "Expressions that always have the same value.", e: "2(x + 3) and 2x + 6" },
  "Variable":            { d: "A letter that stands for an unknown number.", e: "The x in 3x + 7." },
  "Coefficient":         { d: "The number multiplied by a variable.", e: "In 7x, the coefficient is 7." },
  "Constant":            { d: "A term with a fixed value and no variable.", e: "In 3x + 8, the constant is 8." },
  "Constants":           { d: "Terms with fixed values that do not change." },
  "Term":                { d: "One part of an expression, separated by + or −.", e: "3x + 8 has two terms." },
  "Terms":               { d: "The separate parts of an expression, divided by + or −." },
  "Like Terms":          { d: "Terms with the exact same variable and exponent.", e: "4x and 9x are like terms. 4x and 4x² are not." },
  "Combine":             { d: "To add or subtract like terms into a single term.", e: "4x + 9x = 13x" },
  "Expand":              { d: "To multiply out and remove parentheses.", e: "3(x + 2) expands to 3x + 6." },
  "Distribute":          { d: "To multiply the outside factor by every term inside the parentheses." },
  "Parentheses":         { d: "Grouping symbols showing what to calculate first." },
  "Grouping Symbols":    { d: "Symbols such as parentheses or brackets that show what to do first." },
  "Order of Operations": { d: "The agreed order for calculating: grouping, exponents, multiply/divide, add/subtract." },
  "Evaluate":            { d: "To find the value of an expression.", e: "Evaluate 3x + 1 when x = 4 to get 13." },
  "Substitute":          { d: "To replace a variable with a given number.", e: "Substitute 4 for x in 3x + 1." },
  "Distributive Property":{ d: "Multiplying a sum by multiplying each part separately.", e: "3(x + 2) = 3x + 6" },
  "Commutative Property": { d: "Order does not change the sum or product.", e: "4 + 7 = 7 + 4" },
  "Associative Property": { d: "Grouping does not change the sum or product.", e: "(2 + 3) + 5 = 2 + (3 + 5)" },
  "Equivalent Property":  { d: "A property showing two expressions always have equal value." },
  "Product of Two Factors": { d: "The result of multiplying two numbers or expressions." },
  "Product of Two Terms":   { d: "The result of multiplying two terms together." },
  "Sign":                { d: "Whether a number is positive or negative." },
  "Signs":               { d: "The positive and negative marks on numbers in an expression." },

  /* ---------- EQUATIONS & INEQUALITIES ---------- */
  "Equation":            { d: "A math sentence stating two expressions are equal.", e: "3x + 1 = 13" },
  "Solution":            { d: "The value that makes an equation or inequality true.", e: "x = 4 is the solution of 3x + 1 = 13." },
  "Solution Set":        { d: "All the values that make a statement true." },
  "Equal Sign":          { d: "The symbol = showing both sides have the same value." },
  "Equality":            { d: "The state of two expressions having the same value." },
  "Balance":             { d: "Keeping both sides of an equation equal by doing the same thing to each side." },
  "Unknown":             { d: "The value you are solving for." },
  "Inverse Operation":   { d: "The operation that undoes another.", e: "Subtraction undoes addition." },
  "Inverse":             { d: "An operation that undoes another operation." },
  "Addition Property":   { d: "Adding the same amount to both sides keeps an equation balanced." },
  "Subtraction Property":{ d: "Subtracting the same amount from both sides keeps an equation balanced." },
  "Multiplication Property": { d: "Multiplying both sides by the same number keeps an equation balanced." },
  "Division Property":   { d: "Dividing both sides by the same nonzero number keeps an equation balanced." },
  "Properties of Equality": { d: "Rules that let you change both sides of an equation the same way." },
  "Addition Property of Inequality":       { d: "Adding the same amount to both sides keeps an inequality true." },
  "Subtraction Property of Inequality":    { d: "Subtracting the same amount from both sides keeps an inequality true." },
  "Multiplication Property of Inequality": { d: "Multiplying both sides by the same number; flip the symbol if it is negative." },
  "Division Property of Inequality":       { d: "Dividing both sides by the same number; flip the symbol if it is negative." },
  "Inequality":          { d: "A math sentence comparing values using <, >, ≤, or ≥.", e: "x > 5 means x is any number above 5." },
  "Greater Than":        { d: "The symbol > meaning larger than." },
  "Less Than":           { d: "The symbol < meaning smaller than." },
  "At Least":            { d: "Phrase meaning greater than or equal to (≥)." },
  "At Most":             { d: "Phrase meaning less than or equal to (≤)." },
  "Cannot Exceed":       { d: "Phrase meaning less than or equal to (≤)." },
  "Reverse":             { d: "To flip the inequality symbol after multiplying or dividing by a negative." },
  "Bar Diagram":         { d: "A rectangle model showing how parts relate to a whole in an equation." },
  "Area Model":          { d: "A rectangle drawing used to show multiplication or the distributive property." },
  "Multiplying":         { d: "Performing multiplication." },
  "Pattern":             { d: "A repeating or predictable arrangement of numbers or shapes." },
  "Rule":                { d: "The relationship that tells how to get from input to output." },
  "Sequence":            { d: "An ordered list of numbers that follows a rule." },
  "Input":               { d: "The value you put into a rule or equation; the independent variable." },
  "Output":              { d: "The value that comes out of a rule; the dependent variable." },
  "Independent Variable":{ d: "The variable you choose or control.", e: "Hours worked, in a pay equation." },
  "Dependent Variable":  { d: "The variable that changes in response to the other.", e: "Money earned, in a pay equation." },
  "Relationship":        { d: "How two quantities change together." },
  "Table":               { d: "An organized chart of paired values." },

  /* ---------- RATIO, RATE, PROPORTION ---------- */
  "Ratio":               { d: "A comparison of two quantities using division.", e: "3 cats to 4 dogs is 3:4." },
  "Equivalent Ratios":   { d: "Ratios that name the same relationship.", e: "2:3 and 4:6" },
  "Equivalent Ratio":    { d: "A ratio equal in value to another." },
  "Equivalent":          { d: "Equal in value, though possibly written differently." },
  "Equivalent Measure":  { d: "Two measurements naming the same amount in different units.", e: "12 inches = 1 foot" },
  "Compare":             { d: "To decide which value is greater, less, or if they are equal." },
  "Part-to-Part":        { d: "A ratio comparing one group to another group.", e: "3 cats to 4 dogs." },
  "Part-to-Whole":       { d: "A ratio comparing one group to the total.", e: "3 cats to 7 animals." },
  "Colon":               { d: "The symbol : used to write a ratio.", e: "3:4" },
  "Fraction Form":       { d: "A ratio written as a fraction.", e: "3:4 written as 3/4." },
  "Scale Factor":        { d: "The number you multiply by to enlarge or shrink.", e: "Doubling uses a scale factor of 2." },
  "Scale":               { d: "The ratio comparing a drawing's size to the real object's size." },
  "Proportion":          { d: "An equation stating two ratios are equal.", e: "2/3 = 4/6" },
  "Proportional":        { d: "Having a constant ratio between two quantities." },
  "Proportional Relationship": { d: "A relationship where the ratio between two quantities never changes." },
  "Proportional Reasoning":    { d: "Using equal ratios to solve a problem." },
  "Constant of Proportionality": { d: "The unchanging ratio y/x in a proportional relationship.", e: "In y = 6x, it is 6." },
  "Double Number Line":  { d: "Two parallel number lines used to compare related quantities." },
  "Ratio Table":         { d: "A table of equivalent ratios." },
  "Rate":                { d: "A ratio comparing quantities with different units.", e: "120 miles in 2 hours." },
  "Unit Rate":           { d: "A rate for exactly one unit.", e: "60 miles per hour." },
  "Unit Price":          { d: "The cost of one unit of an item.", e: "$3.00 per pound." },
  "Cost Per Unit":       { d: "How much one item or one unit costs." },
  "Better Buy":          { d: "The option with the lower unit price." },
  "Speed":               { d: "A rate comparing distance to time." },
  "Time":                { d: "The duration measured in a rate problem." },

  /* ---------- MEASUREMENT ---------- */
  "Customary Units":     { d: "The U.S. measurement system: inches, feet, pounds, cups." },
  "Customary":           { d: "Belonging to the U.S. measurement system." },
  "Metric System":       { d: "A measurement system based on tens: meters, grams, liters." },
  "Metric":              { d: "Belonging to the base-ten measurement system." },
  "Measurement":         { d: "The size, length, or amount of something." },
  "Unit":                { d: "The standard amount used to measure something." },
  "Inch":                { d: "A customary unit of length; 12 inches make a foot." },
  "Foot":                { d: "A customary unit of length equal to 12 inches." },
  "Yard":                { d: "A customary unit of length equal to 3 feet." },
  "Mile":                { d: "A customary unit of length equal to 5,280 feet." },
  "Pound":               { d: "A customary unit of weight equal to 16 ounces." },
  "Ounce":               { d: "A small customary unit of weight; 16 make a pound." },
  "Millimeter":          { d: "A metric length unit; 1,000 make a meter." },
  "Centimeter":          { d: "A metric length unit; 100 make a meter." },
  "Meter":               { d: "The base metric unit of length, a little longer than a yard." },
  "Kilometer":           { d: "A metric length unit equal to 1,000 meters." },
  "Gram":                { d: "The base metric unit of mass." },
  "Liter":               { d: "The base metric unit of liquid volume." },
  "Conversion Factor":   { d: "A ratio equal to 1 used to change units.", e: "12 in / 1 ft" },

  /* ---------- PERCENT ---------- */
  "Percent":             { d: "A ratio comparing a number to 100.", e: "25% means 25 out of 100." },
  "Hundred":             { d: "The whole in a percent; 100%." },
  "Part":                { d: "The portion of the whole you are describing." },
  "Whole":               { d: "The total amount, equal to 100%." },
  "Benchmark":           { d: "A familiar value used to estimate.", e: "50%, 25%, and 10%." },
  "Benchmark Percent":   { d: "A common percent that is easy to compute mentally.", e: "10% of 80 is 8." },
  "Percent Equation":    { d: "part = percent × whole, used to solve percent problems." },
  "Percent Change":      { d: "How much a value increased or decreased, as a percent of the original." },
  "Percent Error":       { d: "How far an estimate is from the actual value, as a percent." },
  "Percent Markup":      { d: "The percent added to cost to set the selling price." },
  "Percent Markdown":    { d: "The percent taken off the regular price." },
  "Markup Amount":       { d: "The dollar amount added to the wholesale cost." },
  "Markdown Amount":     { d: "The dollar amount taken off the regular price." },
  "Wholesale Price":     { d: "What the store pays for an item before markup." },
  "Regular Selling Price": { d: "The normal price before any discount." },
  "Discounted Sale Price": { d: "The price after the markdown is subtracted." },
  "Commission":          { d: "Pay earned as a percent of sales." },
  "Interest":            { d: "Money paid for borrowing, or earned for saving." },
  "Interest Rate":       { d: "The percent used to calculate interest." },
  "Principal":           { d: "The original amount borrowed or invested." },
  "Plus":                { d: "Added to; used in markup situations." },
  "Minus":               { d: "Taken away from; used in markdown situations." },
  "Greater Than 100%":   { d: "A percent describing more than one whole.", e: "150% of 20 is 30.", x: true },
  "Less Than 1%":        { d: "A percent describing less than one hundredth of the whole.", x: true },

  /* ---------- STATISTICS & DATA ---------- */
  "Statistical Question":{ d: "A question expecting a variety of answers, answered by collecting data.", e: "\"How tall are 6th graders?\" not \"How tall am I?\"" },
  "Data":                { d: "Collected facts, numbers, or measurements." },
  "Data Set":            { d: "A complete collection of data values." },
  "Variability":         { d: "How spread out the data values are." },
  "Population":          { d: "The entire group being studied." },
  "Sample":              { d: "A smaller group chosen from the population." },
  "Random Sample":       { d: "A sample where every member has an equal chance of being chosen." },
  "Representative Sample": { d: "A sample that fairly reflects the whole population." },
  "Survey":              { d: "A method of collecting data by asking questions." },
  "Inference":           { d: "A conclusion about a population drawn from a sample." },
  "Inferences":          { d: "Conclusions drawn from sample data." },
  "Valid Inference":     { d: "A conclusion supported by a representative sample." },
  "Invalid Inference":   { d: "A conclusion drawn from a biased or unrepresentative sample." },
  "Mean":                { d: "The average: add all values, then divide by how many.", e: "Mean of 4, 6, 8 is 6." },
  "Median":              { d: "The middle value when data is put in order." },
  "Mode":                { d: "The value that appears most often." },
  "Range":               { d: "The greatest value minus the least value." },
  "Average":             { d: "Another word for the mean." },
  "Outlier":             { d: "A value far away from the rest of the data." },
  "Distribution":        { d: "How the data values are spread across their range." },
  "Spread":              { d: "How far apart the data values are." },
  "Cluster":             { d: "A group of data values bunched close together." },
  "Gap":                 { d: "An interval on a display where no data values appear." },
  "Peak":                { d: "The tallest part of a data display; where values pile up." },
  "Symmetry":            { d: "When both halves of a distribution mirror each other." },
  "Skewed":              { d: "When data stretches farther out to one side than the other." },
  "Box Plot":            { d: "A display showing the five-number summary along a number line." },
  "Box Plots":           { d: "Displays showing median, quartiles, and extremes on a number line." },
  "Dot Plots":           { d: "Displays using stacked dots above a number line to show frequency." },
  "Quartile":            { d: "A value dividing ordered data into four equal parts." },
  "Interquartile Range": { d: "The spread of the middle half of the data: Q3 minus Q1." },
  "Mean Absolute Deviation": { d: "The average distance of each data value from the mean." },
  "Minimum":             { d: "The least value in a data set." },
  "Maximum":             { d: "The greatest value in a data set." },
  "Five-Number Summary": { d: "Minimum, Q1, median, Q3, and maximum." },
  "Frequency Table":     { d: "A table showing how many values fall in each interval." },
  "Histogram":           { d: "A bar graph showing frequency for equal intervals, with bars touching." },
  "Interval":            { d: "An equal-sized range of values on a display." },
  "Class Width":         { d: "The size of each interval in a histogram." },
  "Frequency":           { d: "How many times a value or interval occurs." },

  /* ---------- PROBABILITY ---------- */
  "Probability":         { d: "A number from 0 to 1 describing how likely an event is." },
  "Outcome":             { d: "One possible result of an experiment." },
  "Outcomes":            { d: "The possible results of an experiment." },
  "Event":               { d: "One outcome or a group of outcomes you are interested in." },
  "Simple Event":        { d: "An event with a single outcome." },
  "Compound Event":      { d: "An event made of two or more simple events.", e: "Flipping heads AND rolling a 4." },
  "Sample Space":        { d: "The set of every possible outcome." },
  "Equally Likely":      { d: "When all outcomes have the same chance of happening." },
  "Likely":              { d: "Having a probability greater than 1/2." },
  "Unlikely":            { d: "Having a probability less than 1/2." },
  "Favorable Outcomes":  { d: "The outcomes you are counting as a success." },
  "Theoretical Probability": { d: "What should happen based on math reasoning." },
  "Experimental Probability":{ d: "What actually happened, based on trial results." },
  "Theoretical":         { d: "Based on reasoning rather than on experiment results." },
  "Relative Frequency":  { d: "The number of successes divided by the number of trials." },
  "Probability Model":   { d: "A list of all outcomes with a probability assigned to each." },
  "Simulation":          { d: "A model using coins, dice, or spinners to imitate a real situation." },
  "Trial":               { d: "One run of an experiment." },
  "Trials":              { d: "The repeated runs of an experiment." },

  /* ---------- GRADE 7 GEOMETRY ---------- */
  "Parallelogram":       { d: "A quadrilateral with two pairs of parallel sides." },
  "Quadrilateral":       { d: "A polygon with four sides." },
  "Rectangle":           { d: "A parallelogram with four right angles." },
  "Square":              { d: "A rectangle with four equal sides." },
  "Trapezoid":           { d: "A quadrilateral with at least one pair of parallel sides." },
  "Triangle":            { d: "A polygon with three sides." },
  "Unique Triangle":     { d: "Only one triangle can be drawn from the given conditions." },
  "Included Angle":      { d: "The angle between two given sides." },
  "Nonincluded Angle":   { d: "An angle that is not between the two given sides." },
  "Line Segment":        { d: "A straight path with two endpoints." },
  "Isosceles":           { d: "A triangle with at least two equal sides." },
  "Point":               { d: "An exact location with no size." },
  "Angle":               { d: "The figure formed by two rays sharing an endpoint." },
  "Adjacent Angles":     { d: "Two angles that share a side and a vertex but do not overlap." },
  "Complementary Angles":{ d: "Two angles whose measures add to 90°." },
  "Supplementary Angles":{ d: "Two angles whose measures add to 180°." },
  "Vertical Angles":     { d: "Opposite angles formed by two intersecting lines; always equal." },
  "Center":              { d: "The middle point of a circle, the same distance from every edge point." },
  "Circumference":       { d: "The distance around a circle." },
  "Diameter":            { d: "A segment through the center connecting two points on the circle." },
  "Radius":              { d: "A segment from the center to the edge; half the diameter." },
  "Pi":                  { d: "The ratio of circumference to diameter, about 3.14." },
  "Cross Section":       { d: "The 2-D shape you see when you slice a 3-D solid." },
  "Three-Dimensional":   { d: "Having length, width, and height." },
  "Two-Dimensional":     { d: "Flat; having only length and width." },
  "Three-Dimensional Figure": { d: "A solid figure with length, width, and height." },
  "Composite Figures":   { d: "Shapes made by combining two or more simpler shapes." },
  "Prism":               { d: "A solid with two parallel congruent bases and rectangular faces." },
  "Triangular Prism":    { d: "A prism whose two bases are triangles." },
  "Volume":              { d: "The amount of space inside a solid figure." },
  "Cubic Unit":          { d: "The unit used to measure volume.", e: "Cubic centimeters, cubic feet." },

  /* =====================================================================
     GRADE 8 ADDITIONS
     Only terms not already defined above. Grade 8 reuses 60+ existing
     entries (Coefficient, Slope-free algebra terms, Outlier, Pi, and so
     on) — that reuse is the point of the shared dictionary.
     ===================================================================== */

  /* ---------- REAL NUMBERS, ROOTS, EXPONENTS ---------- */
  "Equivalent Forms":    { d: "Different ways of writing the same value.", e: "3/4, 0.75, and 75%." },
  "Equivalent Form":     { d: "Another way of writing the same value." },
  "Real Number":         { d: "Any number on the number line — rational or irrational." },
  "Irrational Number":   { d: "A number that cannot be written as a fraction of two integers.", e: "√2 and π." },
  "Nonterminating Decimal": { d: "A decimal that never ends." },
  "Nonrepeating Decimal":   { d: "A decimal with no repeating pattern of digits." },
  "Approximation":       { d: "A value close to the exact one, used when the exact value is not needed.", e: "π ≈ 3.14" },
  "Order":               { d: "To arrange values from least to greatest or greatest to least." },
  "Inequality Symbol":   { d: "A symbol comparing values: <, >, ≤, or ≥." },
  "Square Root":         { d: "A number that, multiplied by itself, gives the original.", e: "√49 = 7" },
  "Cube Root":           { d: "A number that, used three times as a factor, gives the original.", e: "∛27 = 3" },
  "Principal Square Root": { d: "The positive square root of a number.", e: "The principal square root of 25 is 5, not -5." },
  "Radical":             { d: "The √ symbol showing a root is being taken." },
  "Radicand":            { d: "The number underneath the radical symbol.", e: "In √49, the radicand is 49." },
  "Perfect Square":      { d: "A number whose square root is a whole number.", e: "1, 4, 9, 16, 25 ..." },
  "Perfect Cube":        { d: "A number whose cube root is a whole number.", e: "1, 8, 27, 64 ..." },
  "Isolate":             { d: "To get the variable alone on one side of the equation." },
  "Integer Exponent":    { d: "An exponent that is a positive or negative whole number, or zero." },
  "Zero Exponent":       { d: "Any nonzero number raised to the zero power equals 1.", e: "7⁰ = 1" },
  "Negative Exponent":   { d: "Means the reciprocal of the positive power.", e: "2⁻³ = 1/2³ = 1/8" },
  "Product of Powers Property":  { d: "Same base, multiplying: add the exponents.", e: "x³ · x⁴ = x⁷" },
  "Quotient of Powers Property": { d: "Same base, dividing: subtract the exponents.", e: "x⁷ ÷ x⁴ = x³" },
  "Power of a Power":    { d: "Raising a power to a power: multiply the exponents.", e: "(x³)⁴ = x¹²" },
  "Power of a Product":  { d: "Each factor inside gets the exponent.", e: "(2x)³ = 8x³" },
  "Power of a Quotient": { d: "Both numerator and denominator get the exponent.", e: "(x/y)³ = x³/y³" },
  "Power of Ten":        { d: "10 raised to an exponent.", e: "10⁴ = 10,000" },
  "Order of Magnitude":  { d: "The power of ten closest to a number's size; each step is 10 times bigger." },
  "Quantity":            { d: "An amount that can be measured or counted." },
  "Scientific Notation": { d: "A number written as a value between 1 and 10 times a power of ten.", e: "4,500 = 4.5 × 10³" },
  "Very Large Number":   { d: "A number with many digits, best written in scientific notation." },
  "Very Small Number":   { d: "A number very close to zero, written with a negative power of ten." },

  /* ---------- LINEAR EQUATIONS & FUNCTIONS ---------- */
  "Equivalent Equation": { d: "An equation with the same solution as another." },
  "Multistep Equation":  { d: "An equation needing more than two steps to solve." },
  "Linear Equation":     { d: "An equation whose graph is a straight line." },
  "One Solution":        { d: "The variable has exactly one value that works.", e: "2x = 8 gives only x = 4." },
  "No Solution":         { d: "No value of the variable makes the equation true.", e: "x + 1 = x + 2" },
  "Infinitely Many Solutions": { d: "Every value of the variable works.", e: "2x + 4 = 2(x + 2)" },
  "Identity":            { d: "An equation true for every value of the variable." },
  "Contradiction":       { d: "An equation that is never true for any value." },
  "Slope":               { d: "The steepness of a line: rise over run.", e: "Up 3, right 4 gives a slope of 3/4." },
  "Rate of Change":      { d: "How much the output changes for each unit of input; the slope." },
  "Constant Rate of Change": { d: "A rate that never varies, producing a straight-line graph." },
  "Rise":                { d: "The vertical change between two points on a line." },
  "Run":                 { d: "The horizontal change between two points on a line." },
  "Linear Relationship": { d: "A relationship whose graph is a straight line." },
  "y-Intercept":         { d: "Where the line crosses the y-axis; the value when x is 0." },
  "x-Intercept":         { d: "Where the line crosses the x-axis; the value when y is 0." },
  "Vertical Axis":       { d: "The up-and-down axis on a graph; the y-axis." },
  "Initial Value":       { d: "The starting amount, before any change; the y-intercept.", e: "A $5 sign-up fee." },
  "Slope-Intercept Form":{ d: "y = mx + b, where m is slope and b is the y-intercept." },
  "Equation of a Line":  { d: "An equation describing every point on a line." },
  "Mathematical Model":  { d: "An equation or graph used to represent a real situation." },
  "Constraint":          { d: "A limit or condition the answer must satisfy." },
  "Real-World Problem":  { d: "A math problem set in an everyday situation." },
  "Real-World Context":  { d: "The everyday situation a math model represents." },
  "Relation":            { d: "Any set of ordered pairs." },
  "Function":            { d: "A rule where every input gives exactly one output." },
  "Function Rule":       { d: "The equation showing how to get the output from the input." },
  "Domain":              { d: "All the possible input values of a function." },
  "Range of a Function": { d: "All the possible output values of a function.", e: "Different from the statistical range, which is max minus min." },
  "Mapping Diagram":     { d: "A drawing with arrows linking each input to its output." },
  "Linear Function":     { d: "A function whose graph is a straight line." },
  "Nonlinear Function":  { d: "A function whose graph is not a straight line." },
  "Straight Line":       { d: "The graph of a linear function." },
  "Curve":               { d: "A graph that bends; a sign the function is nonlinear." },
  "Sketch":              { d: "To draw a quick graph showing shape, not exact values." },
  "Increasing":          { d: "Going up from left to right on a graph." },
  "Decreasing":          { d: "Going down from left to right on a graph." },

  /* ---------- BIVARIATE DATA ---------- */
  "Scatter Plot":        { d: "A graph of paired data points used to look for a pattern." },
  "Bivariate Data":      { d: "Data with two variables measured for each item." },
  "Bivariate Categorical Data": { d: "Two-variable data sorted into categories, not numbers." },
  "Association":         { d: "A pattern showing two variables are related." },
  "Trend":               { d: "The general direction the data points follow." },
  "Linear Association":  { d: "Points that cluster around a straight line." },
  "Positive Association":{ d: "As one variable increases, so does the other." },
  "Negative Association":{ d: "As one variable increases, the other decreases." },
  "No Association":      { d: "No pattern between the two variables." },
  "Line of Best Fit":    { d: "A line drawn to pass as close as possible to all the points." },
  "Correlation":         { d: "How strongly two variables are related." },
  "Linear Model":        { d: "A line used to describe and predict from data." },
  "Prediction":          { d: "An estimate of an unknown value based on a model." },
  "Interpolation":       { d: "Estimating a value inside the range of the data." },
  "Extrapolation":       { d: "Estimating a value beyond the range of the data." },
  "Two-Way Table":       { d: "A table sorting data by two categories at once." },
  "Category":            { d: "A group that data values are sorted into." },
  "Joint Frequency":     { d: "The count in a single cell of a two-way table." },
  "Marginal Frequency":  { d: "The total of a row or column in a two-way table." },
  "Row Total":           { d: "The sum of all values across one row." },
  "Column Total":        { d: "The sum of all values down one column." },
  "Joint Relative Frequency":       { d: "A single cell's count divided by the grand total." },
  "Marginal Relative Frequency":    { d: "A row or column total divided by the grand total." },
  "Conditional Relative Frequency": { d: "A cell divided by its own row or column total." },

  /* ---------- SYSTEMS OF EQUATIONS ---------- */
  "System of Equations": { d: "Two or more equations solved together." },
  "System of Linear Equations": { d: "Two or more straight-line equations solved together." },
  "Intersection":        { d: "The point where two graphs cross; the solution of the system." },
  "Inspection":          { d: "Finding the answer by reasoning about the equations, without full solving." },
  "Equivalent Values":   { d: "Values that are equal in amount." },
  "Graphing":            { d: "Solving by drawing both lines and reading where they meet." },
  "Parallel Lines":      { d: "Lines with the same slope that never meet." },
  "Coincident Lines":    { d: "Two equations that graph as the exact same line." },
  "Substitution":        { d: "Replacing a variable with an equal expression to solve a system." },
  "Replace":             { d: "To swap a variable for an expression of equal value." },
  "Elimination":         { d: "Adding or subtracting equations to cancel one variable." },
  "Combine Equations":   { d: "Adding two equations together to remove a variable." },

  /* ---------- TRANSFORMATIONS, CONGRUENCE, SIMILARITY ---------- */
  "Transformation":      { d: "A change in a figure's position, size, or orientation." },
  "Rigid Motion":        { d: "A transformation that preserves size and shape." },
  "Preimage":            { d: "The original figure, before the transformation." },
  "Image":               { d: "The figure that results after the transformation." },
  "Coordinate Rule":     { d: "A rule showing how each point's coordinates change.", e: "(x, y) → (x + 3, y - 2)" },
  "Horizontal Shift":    { d: "A slide left or right." },
  "Vertical Shift":      { d: "A slide up or down." },
  "Line of Reflection":  { d: "The line a figure is flipped across." },
  "Mirror Image":        { d: "The reversed figure produced by a reflection." },
  "Rotation":            { d: "A turn of a figure around a fixed point." },
  "Center of Rotation":  { d: "The fixed point a figure turns around." },
  "Angle of Rotation":   { d: "How many degrees a figure is turned." },
  "Clockwise":           { d: "Turning in the direction the hands of a clock move." },
  "Counterclockwise":    { d: "Turning opposite to the hands of a clock." },
  "Composition of Transformations": { d: "Two or more transformations performed in order." },
  "Mapping":             { d: "Matching each point of the preimage to its image." },
  "Congruent Figures":   { d: "Figures with the same size and shape." },
  "Congruence":          { d: "Having exactly the same size and shape." },
  "Corresponding Parts": { d: "Matching sides or angles in two related figures." },
  "Corresponding Angles":{ d: "Matching angles in two figures, or in lines cut by a transversal." },
  "Corresponding Sides": { d: "Matching sides in two related figures." },
  "Congruent Angles":    { d: "Angles with equal measure." },
  "Same Size":           { d: "Equal in measurement." },
  "Same Shape":          { d: "Having the same form, though possibly a different size." },
  "Dilation":            { d: "A transformation that enlarges or shrinks a figure." },
  "Center of Dilation":  { d: "The fixed point a dilation grows or shrinks from." },
  "Enlargement":         { d: "A dilation with a scale factor greater than 1." },
  "Reduction":           { d: "A dilation with a scale factor between 0 and 1." },
  "Proportional Sides":  { d: "Sides whose lengths share a constant ratio." },
  "Proportional Lengths":{ d: "Lengths related by the same scale factor." },
  "Similar Figures":     { d: "Figures with the same shape but not necessarily the same size." },
  "Similar Triangles":   { d: "Triangles with equal angles and proportional sides." },
  "Similarity":          { d: "Having the same shape, with sides in proportion." },
  "Transversal":         { d: "A line crossing two or more other lines." },
  "Alternate Interior Angles": { d: "Opposite angles inside two lines cut by a transversal; equal when the lines are parallel." },
  "Alternate Exterior Angles": { d: "Opposite angles outside two lines cut by a transversal; equal when the lines are parallel." },
  "Same-Side Interior Angles": { d: "Inside angles on the same side of a transversal; supplementary when the lines are parallel." },
  "Angle-Angle Criterion": { d: "If two angles of one triangle equal two of another, the triangles are similar." },
  "Indirect Measurement":{ d: "Using similar figures to find a length you cannot measure directly.", e: "Finding a tree's height from its shadow." },

  /* ---------- PYTHAGOREAN THEOREM ---------- */
  "Pythagorean Theorem": { d: "In a right triangle, the squares of the legs add to the square of the hypotenuse." },
  "Converse":            { d: "A statement with the if and then parts swapped." },
  "Right Triangle":      { d: "A triangle containing one 90° angle." },
  "Acute Triangle":      { d: "A triangle whose angles are all less than 90°." },
  "Obtuse Triangle":     { d: "A triangle with one angle greater than 90°." },
  "Hypotenuse":          { d: "The longest side of a right triangle, opposite the right angle." },
  "Leg":                 { d: "One of the two shorter sides of a right triangle." },
  "Side Length":         { d: "The measure of one side of a figure." },
  "Classify":            { d: "To sort a figure into a category by its properties." },
  "Unknown Length":      { d: "The side measure you are solving for." },
  "Diagonal":            { d: "A segment connecting two non-adjacent corners." },
  "Area":                { d: "The amount of surface inside a flat shape." },
  "a^2+b^2=c^2":         { d: "The Pythagorean Theorem written as a formula.", x: true },

  /* ---------- SURFACE AREA & VOLUME ---------- */
  "Cylinder":            { d: "A solid with two parallel circular bases." },
  "Cone":                { d: "A solid with one circular base narrowing to a point." },
  "Sphere":              { d: "A perfectly round solid; every point is the same distance from the center." },
  "Composite Solid":     { d: "A solid made by joining two or more simpler solids." },
  "Surface Area":        { d: "The total area of all the outside surfaces of a solid." },
  "Lateral Area":        { d: "The surface area of the sides only, not the bases." },
  "Circular Base":       { d: "The flat circular face of a cylinder or cone." },
  "Base Area":           { d: "The area of the base, used in volume formulas." },
  "Height":              { d: "The perpendicular distance from base to top." },
  "Slant Height":        { d: "The distance along the slanted surface from base edge to apex." },
  "Great Circle":        { d: "The largest circle you can draw on a sphere, passing through its center." },
  "Net":                 { d: "A flat pattern that folds into a solid figure." },
  "Square Units":        { d: "The units used to measure area.", e: "Square inches, square meters." },
  "Cubic Units":         { d: "The units used to measure volume." },
  "One-Third":           { d: "The fraction 1/3, used in the volume formula for a cone." },
  "Formula":             { d: "A rule written with symbols for calculating a value." },
  "Decompose":           { d: "To break a figure into simpler parts." },
  "Overlapping Parts":   { d: "Surfaces hidden where two solids join, not counted in surface area." }
};


/* =====================================================================
   CURRICULUM — grade > topic > lesson > term keys
   Lesson IDs match the Savvas / SLPS pacing guide exactly so a teacher
   can pull up the lesson they taught that day.
   ===================================================================== */

const CURRICULUM = {

  "6": {
    name: "Grade 6",
    topics: [
      {
        id: "6-T1", n: 1, title: "Use Positive Rational Numbers", quarter: 1,
        lessons: [
          { id: "1-1", title: "Fluently Add, Subtract, and Multiply Decimals",
            terms: ["Decimal","Decimal Point","Place Value","Addend","Sum","Difference","Product","Estimate","Regroup","Compatible Numbers"] },
          { id: "1-2", title: "Fluently Divide Whole Numbers and Decimals",
            terms: ["Dividend","Divisor","Quotient","Remainder","Decimal Quotient","Long Division","Estimate","Compatible Numbers"] },
          { id: "1-3", title: "Multiply Fractions",
            terms: ["Numerator","Denominator","Fraction","Mixed Number","Improper Fraction","Product","Simplify","Equivalent Fraction"] },
          { id: "1-4", title: "Understand Division with Fractions",
            terms: ["Dividend","Divisor","Quotient","Reciprocal","Fraction Model","Unit Fraction","Equal Groups"] },
          { id: "1-5", title: "Divide Fractions by Fractions",
            terms: ["Reciprocal","Complex Fraction","Quotient","Dividend","Divisor","Simplify","Mixed Number","Improper Fraction"] },
          { id: "1-6", title: "Divide Mixed Numbers",
            terms: ["Mixed Number","Improper Fraction","Reciprocal","Quotient","Simplify","Convert","Equivalent Fraction"] },
          { id: "1-7", title: "Solve Problems with Rational Numbers",
            terms: ["Rational Number","Operation","Estimate","Equation","Variable","Solution","Expression","Multi-Step Problem"] }
        ]
      },
      {
        id: "6-T2", n: 2, title: "Integers and Rational Numbers", quarter: 1,
        lessons: [
          { id: "2-1", title: "Understand Integers",
            terms: ["Integer","Positive Integer","Negative Integer","Zero","Opposite","Number Line","Whole Number"] },
          { id: "2-2", title: "Represent Rational Numbers on the Number Line",
            terms: ["Rational Number","Number Line","Coordinate","Fraction","Decimal","Integer","Graph","Plot"] },
          { id: "2-3", title: "Absolute Values of Rational Numbers",
            terms: ["Absolute Value","Distance","Opposite","Positive","Negative","Integer","Rational Number"] },
          { id: "2-4", title: "Represent Rational Numbers on the Coordinate Plane",
            terms: ["Coordinate Plane","Ordered Pair","x-axis","y-axis","Origin","Quadrant","Plot","Coordinate"] },
          { id: "2-5", title: "Find Distances on the Coordinate Plane",
            terms: ["Coordinate Plane","Distance","Horizontal Distance","Vertical Distance","Ordered Pair","Absolute Value","Units"] },
          { id: "2-6", title: "Represent Polygons on the Coordinate Plane",
            terms: ["Polygon","Vertex","Side","Coordinate Plane","Ordered Pair","Translation","Reflection","Congruent"] }
        ]
      },
      {
        id: "6-T3", n: 3, title: "Numeric and Algebraic Expressions", quarter: 2,
        lessons: [
          { id: "3-1", title: "Understand and Represent Exponents",
            terms: ["Exponent","Base","Power","Squared","Cubed","Expanded Form","Standard Form"] },
          { id: "3-2", title: "Find Greatest Common Factor and Least Common Multiple",
            terms: ["Greatest Common Factor","Least Common Multiple","Prime Number","Composite Number","Factor","Multiple","Prime Factorization"] },
          { id: "3-3", title: "Write and Evaluate Numerical Expressions",
            terms: ["Numerical Expression","Parentheses","Order of Operations","Evaluate","Operation","Exponent","Grouping Symbols"] },
          { id: "3-4", title: "Write Algebraic Expressions",
            terms: ["Variable","Expression","Coefficient","Constant","Term","Algebraic Expression","Operation"] },
          { id: "3-5", title: "Evaluate Algebraic Expressions",
            terms: ["Variable","Substitute","Evaluate","Expression","Constant","Coefficient","Solution"] },
          { id: "3-6", title: "Generate Equivalent Expressions",
            terms: ["Equivalent Expression","Distributive Property","Commutative Property","Associative Property","Factor","Expand","Simplify"] },
          { id: "3-7", title: "Simplify Algebraic Expressions",
            terms: ["Like Terms","Simplify","Combine","Coefficient","Constant","Variable","Expression"] }
        ]
      },
      {
        id: "6-T4", n: 4, title: "Represent and Solve Equations and Inequalities", quarter: 2,
        lessons: [
          { id: "4-1", title: "Understand Equations and Solutions",
            terms: ["Equation","Variable","Solution","Equal Sign","Expression","Balance","Unknown"] },
          { id: "4-2", title: "Apply Properties of Equality",
            terms: ["Addition Property","Subtraction Property","Multiplication Property","Division Property","Equality","Inverse Operation","Balance"] },
          { id: "4-3", title: "Write and Solve Addition and Subtraction Equations",
            terms: ["Variable","Equation","Solution","Inverse Operation","Addition","Subtraction","Check"] },
          { id: "4-4", title: "Write and Solve Multiplication and Division Equations",
            terms: ["Multiplication","Division","Variable","Equation","Inverse Operation","Solution","Coefficient"] },
          { id: "4-5", title: "Write and Solve Equations with Rational Numbers",
            terms: ["Rational Number","Equation","Variable","Integer","Fraction","Decimal","Solution"] },
          { id: "4-6", title: "Understand and Write Inequalities",
            terms: ["Inequality","Greater Than","Less Than","At Least","At Most","Solution Set","Number Line"] },
          { id: "4-7", title: "Solve Inequalities",
            terms: ["Inequality","Solution Set","Number Line","Variable","Greater Than","Less Than","Graph"] },
          { id: "4-8", title: "Understand Dependent and Independent Variables",
            terms: ["Independent Variable","Dependent Variable","Input","Output","Relationship","Table","Equation"] },
          { id: "4-9", title: "Use Patterns to Write and Solve Equations",
            terms: ["Pattern","Rule","Variable","Equation","Input","Output","Sequence"] },
          { id: "4-10", title: "Relate Tables, Graphs, and Equations",
            terms: ["Table","Graph","Equation","Coordinate Plane","Ordered Pair","Input","Output"] }
        ]
      },
      {
        id: "6-T5", n: 5, title: "Understand and Use Ratio and Rate", quarter: 3,
        lessons: [
          { id: "5-1", title: "Understand Ratios",
            terms: ["Ratio","Compare","Part-to-Part","Part-to-Whole","Equivalent Ratios","Colon","Fraction Form"] },
          { id: "5-2", title: "Generate Equivalent Ratios",
            terms: ["Ratio","Equivalent Ratio","Scale Factor","Simplify","Multiply","Divide","Proportion"] },
          { id: "5-3", title: "Compare Ratios",
            terms: ["Ratio","Equivalent Ratio","Unit Rate","Table","Compare","Scale Factor","Proportion"] },
          { id: "5-4", title: "Represent and Graph Ratios",
            terms: ["Ratio Table","Coordinate Plane","Ordered Pair","Graph","Equivalent Ratio","Scale","Axis"] },
          { id: "5-5", title: "Understand Rates and Unit Rates",
            terms: ["Rate","Unit Rate","Ratio","Unit Price","Speed","Cost Per Unit","Compare"] },
          { id: "5-6", title: "Compare Unit Rates",
            terms: ["Unit Rate","Better Buy","Cost Per Unit","Compare","Ratio","Rate","Unit Price"] },
          { id: "5-7", title: "Solve Unit Rate Problems",
            terms: ["Unit Rate","Rate","Ratio","Distance","Time","Speed","Unit Price"] },
          { id: "5-8", title: "Ratio Reasoning: Convert Customary Units",
            terms: ["Customary Units","Inch","Foot","Yard","Mile","Pound","Ounce"] },
          { id: "5-9", title: "Ratio Reasoning: Convert Metric Units",
            terms: ["Metric System","Millimeter","Centimeter","Meter","Kilometer","Gram","Liter"] },
          { id: "5-10", title: "Relate Customary and Metric Units",
            terms: ["Convert","Estimate","Measurement","Metric","Customary","Unit","Equivalent Measure"] }
        ]
      },
      {
        id: "6-T6", n: 6, title: "Understand and Use Percent", quarter: 3,
        lessons: [
          { id: "6-1", title: "Understand Percent",
            terms: ["Percent","Hundred","Part","Whole","Ratio","Fraction","Decimal"] },
          { id: "6-2", title: "Relate Fractions, Decimals, and Percents",
            terms: ["Fraction","Decimal","Percent","Equivalent","Convert","Numerator","Denominator"] },
          { id: "6-3", title: "Represent Percents Greater Than 100 or Less Than 1",
            terms: ["Percent","Greater Than 100%","Less Than 1%","Decimal","Fraction","Benchmark","Equivalent"] },
          { id: "6-4", title: "Estimate to Find Percent",
            terms: ["Estimate","Benchmark Percent","Percent","Whole","Part","Reasonable Answer","Mental Math"] },
          { id: "6-5", title: "Find the Percent of a Number",
            terms: ["Percent","Part","Whole","Multiply","Decimal","Fraction","Equation"] },
          { id: "6-6", title: "Find the Whole Given a Part and the Percent",
            terms: ["Whole","Part","Percent","Equation","Variable","Inverse Operation","Estimate"] }
        ]
      },
      {
        id: "6-T7", n: 7, title: "Solve Area, Surface Area, and Volume Problems", quarter: 4,
        incomplete: true,
        note: "Lesson vocabulary not yet supplied. Lesson titles come from the SLPS pacing guide. Add terms before enabling this topic.",
        lessons: [
          { id: "7-1", title: "Find Areas of Parallelograms and Rhombuses", terms: [] },
          { id: "7-2", title: "Solve Triangle Area Problems", terms: [] },
          { id: "7-3", title: "Find Areas of Trapezoids and Kites", terms: [] },
          { id: "7-4", title: "Find Areas of Polygons", terms: [] },
          { id: "7-5", title: "Represent Solid Figures Using Nets", terms: [] },
          { id: "7-6", title: "Find Surface Area of Prisms", terms: [] },
          { id: "7-7", title: "Find Surface Areas of Pyramids", terms: [] },
          { id: "7-8", title: "Find Volume with Fractional Edge Lengths", terms: [] }
        ]
      },
      {
        id: "6-T8", n: 8, title: "Display, Describe, and Summarize Data", quarter: 4,
        lessons: [
          { id: "8-1", title: "Recognize Statistical Questions",
            terms: ["Statistical Question","Data","Variability","Population","Sample","Survey","Distribution"] },
          { id: "8-2", title: "Summarize Data Using Mean, Median, Mode, and Range",
            terms: ["Mean","Median","Mode","Range","Data Set","Outlier","Average"] },
          { id: "8-3", title: "Display Data in Box Plots",
            terms: ["Box Plot","Median","Quartile","Interquartile Range","Minimum","Maximum","Five-Number Summary"] },
          { id: "8-4", title: "Display Data in Frequency Tables and Histograms",
            terms: ["Frequency Table","Histogram","Interval","Class Width","Frequency","Data","Scale"] },
          { id: "8-5", title: "Summarize Data Using Measures of Variability",
            terms: ["Variability","Interquartile Range","Mean Absolute Deviation","Spread","Outlier","Data Set","Distribution"] },
          { id: "8-6", title: "Choose Appropriate Statistical Measures",
            terms: ["Mean","Median","Mode","Range","Outlier","Distribution","Variability"] },
          { id: "8-7", title: "Summarize Data Distributions",
            terms: ["Distribution","Cluster","Gap","Symmetry","Skewed","Peak","Spread"] }
        ]
      }
    ]
  },

  "7": {
    name: "Grade 7",
    topics: [
      {
        id: "7-T1", n: 1, title: "Integers and Rational Numbers", quarter: 1,
        lessons: [
          { id: "1-1", title: "Relate Integers and Their Opposites",
            terms: ["Absolute Value","Distance","Integers","Negative Integers","Opposite Integers","Positive Integers","Whole Numbers"] },
          { id: "1-2", title: "Understand Rational Numbers",
            terms: ["Repeating Decimal","Terminating Decimal"] },
          { id: "1-3", title: "Add Integers",
            terms: ["Absolute Value","Additive Inverses","Negative Integer","Positive Integer","Sum"] },
          { id: "1-4", title: "Subtract Integers",
            terms: ["Absolute Value","Additive Inverses","Difference","Different Signs","Negative Integer","Positive Integer","Same Signs","Sum"] },
          { id: "1-5", title: "Add and Subtract Rational Numbers",
            terms: ["Absolute Value","Additive Inverses","Different","Greater","Less","Same"] },
          { id: "1-6", title: "Multiply Integers",
            terms: ["Additive Inverse","Associative Property","Commutative Property","Distributive Property","Factor","Negative","Positive","Product"] },
          { id: "1-7", title: "Multiply Rational Numbers",
            terms: ["Commutative Property","Decimal Expression","Equivalent Decimal","Equivalent Fraction","Rational Expression","Rational Numbers","Repeating Decimal"] },
          { id: "1-8", title: "Divide Integers",
            terms: ["Divisor","Factor","Negative Integer","Product","Quotient","Rational Number"] },
          { id: "1-9", title: "Divide Rational Numbers",
            terms: ["Complex Fraction","Integers","Mixed Number","Rational Number","Reciprocals","Simplify"] },
          { id: "1-10", title: "Solve Problems with Rational Numbers",
            terms: ["Mixed Number","Rational Number","Terminating Decimal"] }
        ]
      },
      {
        id: "7-T2", n: 2, title: "Analyze and Use Proportional Relationships", quarter: 1,
        lessons: [
          { id: "2-1", title: "Connect Ratios, Rates, and Unit Rates",
            terms: ["Equivalent Ratios","Rate","Ratio","Unit Price","Unit Rate"] },
          { id: "2-2", title: "Determine Unit Rates with Ratios of Fractions",
            terms: ["Equivalent Ratios","Rate","Ratio","Unit Price","Unit Rate"] },
          { id: "2-3", title: "Understand Proportional Relationships: Equivalent Ratios",
            terms: ["Equivalent","Equivalent Ratios","Proportional","Proportional Relationship"] },
          { id: "2-4", title: "Describe Proportional Relationships: Constant of Proportionality",
            terms: ["Constant of Proportionality","Equation","Equivalent Ratios","Ratio","Table"] },
          { id: "2-5", title: "Graph Proportional Relationships",
            terms: ["Constant of Proportionality","Coordinate Plane","Equivalent Ratios","Ordered Pairs","Origin","Proportional Relationship","Unit Rate","x-coordinate","y-coordinate"] },
          { id: "2-6", title: "Apply Proportional Reasoning to Solve Problems",
            terms: ["Ordered Pairs","Origin","Proportional Reasoning","Proportional Relationship","Unit Rate","x-coordinate","y-coordinate"] }
        ]
      },
      {
        id: "7-T3", n: 3, title: "Analyze and Solve Percent Problems", quarter: 2,
        lessons: [
          { id: "3-1", title: "Analyze Percents of Numbers",
            terms: ["Equivalent Ratios","Part","Percent","Whole"] },
          { id: "3-2", title: "Connect Percent and Proportion",
            terms: ["Equivalent Ratios","Part","Percent","Proportion","Variable","Whole"] },
          { id: "3-3", title: "Represent and Use the Percent Equation",
            terms: ["Commission","Decimal","Equivalent Ratios","Part","Percent Equation","Whole"] },
          { id: "3-4", title: "Solve Percent Change and Percent Error Problems",
            terms: ["Percent Change","Percent Error"] },
          { id: "3-5", title: "Solve Markup and Markdown Problems",
            terms: ["Discounted Sale Price","Markdown Amount","Markup Amount","Minus","Percent Markdown","Percent Markup","Plus","Regular Selling Price","Wholesale Price"] },
          { id: "3-6", title: "Solve Simple Interest Problems",
            terms: ["Interest","Interest Rate","Principal"] }
        ]
      },
      {
        id: "7-T4", n: 4, title: "Generate Equivalent Expressions", quarter: 2,
        lessons: [
          { id: "4-1", title: "Write and Evaluate Algebraic Expressions",
            terms: ["Coefficient","Constant","Expression","Simplify","Substitute","Variable"] },
          { id: "4-2", title: "Generate Equivalent Expressions",
            terms: ["Additive Inverse","Associative Property","Commutative Property"] },
          { id: "4-3", title: "Simplify Expressions",
            terms: ["Constants","Simplify","Variable"] },
          { id: "4-4", title: "Expand Expressions",
            terms: ["Distributive Property","Equivalent Property","Like Terms","Multiply","Product of Two Factors","Sign"] },
          { id: "4-5", title: "Factor Expressions",
            terms: ["Coefficient","Distributive Property","Factors","Greatest Common Factor","Product of Two Terms"] },
          { id: "4-6", title: "Add Expressions",
            sourceNote: "Curriculum lists this identically to 4-5 — likely a copy/paste error in the source document. Preserved as written.",
            terms: ["Coefficient","Distributive Property","Factors","Greatest Common Factor","Product of Two Terms"] },
          { id: "4-7", title: "Subtract Expressions",
            terms: ["Associative Property","Commutative Property"] },
          { id: "4-8", title: "Analyze Equivalent Expressions",
            terms: ["Associative Property","Commutative Property","Distribute","Like Terms","Parentheses","Signs","Terms"] }
        ]
      },
      {
        id: "7-T5", n: 5, title: "Solve Problems Using Equations and Inequalities", quarter: 3,
        lessons: [
          { id: "5-1", title: "Write Two-Step Equations",
            terms: ["Addition","Coefficient","Constant","Multiplication","Substitute","Variable"] },
          { id: "5-2", title: "Solve Two-Step Equations",
            terms: ["Bar Diagram","Inverse","Properties of Equality","Variable"] },
          { id: "5-3", title: "Solve Equations Using the Distributive Property",
            terms: ["Area Model","Distributive Property","Expanded Form","Multiplying","Properties of Equality","Solution"] },
          { id: "5-4", title: "Solve Inequalities Using Addition or Subtraction",
            terms: ["At Least","At Most","Cannot Exceed","Greater Than","Less Than"] },
          { id: "5-5", title: "Solve Inequalities Using Multiplication or Division",
            terms: ["Coefficient","Division Property of Inequality","Multiplication Property of Inequality","Negative","Reciprocal","Reverse"] },
          { id: "5-6", title: "Solve Two-Step Inequalities",
            terms: ["Coefficient","Constant","Equation","Inequality","Variable"] },
          { id: "5-7", title: "Solve Multi-Step Inequalities",
            terms: ["Addition Property of Inequality","Division Property of Inequality","Multiplication Property of Inequality","Subtraction Property of Inequality"] }
        ]
      },
      {
        id: "7-T6", n: 6, title: "Use Sampling to Draw Inferences About Populations", quarter: 4,
        lessons: [
          { id: "6-1", title: "Populations and Samples",
            terms: ["Population","Random Sample","Representative Sample"] },
          { id: "6-2", title: "Draw Inferences from Data",
            terms: ["Inference","Invalid Inference","Valid Inference"] },
          { id: "6-3", title: "Make Comparative Inferences About Populations",
            terms: ["Box Plots","Dot Plots","Inferences","Interquartile Range","Invalid Inference","Median","Range"] },
          { id: "6-4", title: "Make More Comparative Inferences About Populations",
            terms: ["Dot Plots","Mean","Median","Range"] }
        ]
      },
      {
        id: "7-T7", n: 7, title: "Probability", quarter: 4,
        lessons: [
          { id: "7-1", title: "Understand Likelihood and Probability",
            terms: ["Equally Likely","Outcome","Probability"] },
          { id: "7-2", title: "Understand Theoretical Probability",
            terms: ["Event","Favorable Outcomes","Likely","Theoretical Probability","Unlikely"] },
          { id: "7-3", title: "Understand Experimental Probability",
            terms: ["Event","Experimental Probability","Outcomes","Relative Frequency","Theoretical","Trials"] },
          { id: "7-4", title: "Use Probability Models",
            terms: ["Probability Model","Sample Space"] },
          { id: "7-5", title: "Determine Outcomes of Compound Events",
            terms: ["Compound Event","Outcomes","Sample Space"] },
          { id: "7-6", title: "Find Probabilities of Compound Events",
            terms: ["Compound Event","Experimental Probability","Outcomes","Sample Space","Simple Event","Theoretical Probability"] },
          { id: "7-7", title: "Simulate Compound Events",
            terms: ["Experimental Probability","Sample Space","Simulation","Trial"] }
        ]
      },
      {
        id: "7-T8", n: 8, title: "Solve Problems Involving Geometry", quarter: 3,
        lessons: [
          { id: "8-1", title: "Solve Problems Involving Scale Drawings",
            terms: ["Double Number Line","Proportion","Proportional Relationship","Ratio"] },
          { id: "8-2", title: "Draw Geometric Figures",
            terms: ["Parallelogram","Quadrilateral","Rectangle","Square","Trapezoid"] },
          { id: "8-3", title: "Draw Triangles with Given Conditions",
            terms: ["Greater Than","Included Angle","Line Segment","Nonincluded Angle","Triangle","Unique Triangle"] },
          { id: "8-4", title: "Solve Problems Using Angle Relationships",
            terms: ["Adjacent Angles","Angle","Complementary Angles","Supplementary Angles","Vertical Angles"] },
          { id: "8-5", title: "Solve Problems Involving Circumference of a Circle",
            terms: ["Center","Circumference","Diameter","Pi","Radius","Ratio"] },
          { id: "8-6", title: "Solve Problems Involving Area of a Circle",
            terms: ["Center","Circumference","Diameter","Pi","Radius"] },
          { id: "8-7", title: "Describe Cross Sections",
            terms: ["Cross Section","Isosceles","Point","Square","Three-Dimensional","Triangle","Two-Dimensional"] },
          { id: "8-8", title: "Solve Problems Involving Surface Area",
            terms: ["Composite Figures"] },
          { id: "8-9", title: "Solve Problems Involving Volume",
            terms: ["Cubic Unit","Prism","Three-Dimensional Figure","Triangular Prism","Volume"] }
        ]
      }
    ]
  },

  "8": {
    name: "Grade 8",
    topics: [
      {
        id: "8-T1", n: 1, title: "Real Numbers",
        lessons: [
          { id: "1-1", title: "Rational Numbers as Decimals",
            terms: ["Rational Number","Decimal","Terminating Decimal","Repeating Decimal","Fraction","Numerator","Denominator","Equivalent Forms"] },
          { id: "1-2", title: "Understand Irrational Numbers",
            terms: ["Irrational Number","Nonterminating Decimal","Nonrepeating Decimal","Square Root","Pi","Real Number","Approximation","Perfect Square"] },
          { id: "1-3", title: "Compare and Order Real Numbers",
            terms: ["Real Number","Rational Number","Irrational Number","Number Line","Compare","Order","Approximation","Inequality Symbol"] },
          { id: "1-4", title: "Evaluate Square Roots and Cube Roots",
            terms: ["Square Root","Cube Root","Radical","Radicand","Perfect Square","Perfect Cube","Principal Square Root","Evaluate"] },
          { id: "1-5", title: "Solve Equations Using Square Roots and Cube Roots",
            terms: ["Equation","Square Root","Cube Root","Inverse Operation","Solution","Isolate","Perfect Square","Perfect Cube"] },
          { id: "1-6", title: "Use Properties of Integer Exponents",
            terms: ["Exponent","Base","Integer Exponent","Product of Powers Property","Quotient of Powers Property","Power of a Power","Expanded Form","Simplify"] },
          { id: "1-7", title: "More Properties of Integer Exponents",
            terms: ["Zero Exponent","Negative Exponent","Reciprocal","Power of a Product","Power of a Quotient","Equivalent Expression","Integer Exponent","Simplify"] },
          { id: "1-8", title: "Use Powers of 10 to Estimate Quantities",
            terms: ["Power of Ten","Exponent","Estimate","Order of Magnitude","Place Value","Approximation","Scale","Quantity"] },
          { id: "1-9", title: "Understand Scientific Notation",
            terms: ["Scientific Notation","Standard Form","Coefficient","Power of Ten","Exponent","Decimal Point","Very Large Number","Very Small Number"] },
          { id: "1-10", title: "Operations with Numbers in Scientific Notation",
            terms: ["Scientific Notation","Product","Quotient","Sum","Difference","Coefficient","Power of Ten","Equivalent Form"] }
        ]
      },
      {
        id: "8-T2", n: 2, title: "Analyze and Solve Linear Equations",
        lessons: [
          { id: "2-1", title: "Combine Like Terms to Solve Equations",
            terms: ["Like Terms","Coefficient","Constant","Variable","Combine","Equation","Equivalent Expression","Solution"] },
          { id: "2-2", title: "Solve Equations with Variables on Both Sides",
            terms: ["Variable","Coefficient","Constant","Inverse Operation","Properties of Equality","Equivalent Equation","Isolate","Solution"] },
          { id: "2-3", title: "Solve Multistep Equations",
            terms: ["Multistep Equation","Distributive Property","Like Terms","Inverse Operation","Coefficient","Constant","Variable","Solution"] },
          { id: "2-4", title: "Analyze Solutions of Linear Equations",
            terms: ["One Solution","No Solution","Infinitely Many Solutions","Identity","Contradiction","Equivalent Equation","Linear Equation","Solution Set"] },
          { id: "2-5", title: "Compare Proportional Relationships",
            terms: ["Proportional Relationship","Constant of Proportionality","Unit Rate","Ratio","Table","Graph","Equation","Compare"] },
          { id: "2-6", title: "Connect Proportional Relationships and Slope",
            terms: ["Slope","Rate of Change","Rise","Run","Constant of Proportionality","Proportional Relationship","Linear Relationship","Ordered Pair"] },
          { id: "2-7", title: "Analyze Linear Equations: y = mx",
            terms: ["Linear Equation","Slope","Constant of Proportionality","Origin","Proportional Relationship","Independent Variable","Dependent Variable","Graph"] },
          { id: "2-8", title: "Understand the y-Intercept of a Line",
            terms: ["y-Intercept","x-Intercept","Coordinate Plane","Ordered Pair","Initial Value","Linear Equation","Vertical Axis","Graph"] },
          { id: "2-9", title: "Analyze Linear Equations: y = mx + b",
            terms: ["Slope-Intercept Form","Slope","y-Intercept","Rate of Change","Initial Value","Linear Equation","Independent Variable","Dependent Variable"] },
          { id: "2-10", title: "Write Equations of Lines",
            terms: ["Linear Equation","Slope","y-Intercept","Slope-Intercept Form","Rate of Change","Initial Value","Ordered Pair","Equation of a Line"] },
          { id: "2-11", title: "Solve Linear Equations and Problems",
            terms: ["Linear Equation","Variable","Solution","Mathematical Model","Constraint","Rate of Change","Initial Value","Real-World Problem"] }
        ]
      },
      {
        id: "8-T3", n: 3, title: "Use Functions to Model Relationships",
        lessons: [
          { id: "3-1", title: "Understand Relations and Functions",
            terms: ["Relation","Function","Domain","Range of a Function","Input","Output","Ordered Pair","Function Rule"] },
          { id: "3-2", title: "Connect Representations of Functions",
            terms: ["Function","Table","Graph","Equation","Mapping Diagram","Ordered Pair","Input","Output"] },
          { id: "3-3", title: "Compare Linear and Nonlinear Functions",
            terms: ["Linear Function","Nonlinear Function","Constant Rate of Change","Graph","Table","Equation","Straight Line","Curve"] },
          { id: "3-4", title: "Construct Functions to Model Linear Relationships",
            terms: ["Linear Function","Function Rule","Rate of Change","Initial Value","Slope","y-Intercept","Mathematical Model","Equation"] },
          { id: "3-5", title: "Interpret the Rate of Change and Initial Value",
            terms: ["Rate of Change","Initial Value","Slope","y-Intercept","Unit Rate","Linear Function","Independent Variable","Dependent Variable"] },
          { id: "3-6", title: "Sketch Functions from Verbal Descriptions",
            terms: ["Function","Sketch","Increasing","Decreasing","Constant","Rate of Change","Maximum","Minimum"] },
          { id: "3-7", title: "Analyze and Compare Functions",
            terms: ["Function","Linear Function","Nonlinear Function","Rate of Change","Initial Value","Table","Graph","Equation"] }
        ]
      },
      {
        id: "8-T4", n: 4, title: "Investigate Bivariate Data",
        lessons: [
          { id: "4-1", title: "Construct and Interpret Scatter Plots",
            terms: ["Scatter Plot","Bivariate Data","Ordered Pair","Association","Trend","Cluster","Gap","Outlier"] },
          { id: "4-2", title: "Analyze Linear Associations",
            terms: ["Linear Association","Positive Association","Negative Association","No Association","Line of Best Fit","Correlation","Scatter Plot","Trend"] },
          { id: "4-3", title: "Use Linear Models to Make Predictions",
            terms: ["Linear Model","Prediction","Line of Best Fit","Interpolation","Extrapolation","Trend","Scatter Plot","Estimate"] },
          { id: "4-4", title: "Interpret Two-Way Frequency Tables",
            terms: ["Two-Way Table","Frequency","Category","Joint Frequency","Marginal Frequency","Row Total","Column Total","Bivariate Categorical Data"] },
          { id: "4-5", title: "Analyze Two-Way Relative-Frequency Tables",
            terms: ["Relative Frequency","Two-Way Table","Joint Relative Frequency","Marginal Relative Frequency","Conditional Relative Frequency","Percent","Association","Category"] }
        ]
      },
      {
        id: "8-T5", n: 5, title: "Analyze and Solve Systems of Linear Equations",
        lessons: [
          { id: "5-1", title: "Estimate Solutions by Inspection",
            terms: ["System of Equations","Solution","Ordered Pair","Inspection","Estimate","Intersection","Linear Equation","Equivalent Values"] },
          { id: "5-2", title: "Solve Systems by Graphing",
            terms: ["System of Linear Equations","Graphing","Intersection","Ordered Pair","Solution","Parallel Lines","Coincident Lines","Coordinate Plane"] },
          { id: "5-3", title: "Solve Systems by Substitution",
            terms: ["Substitution","System of Equations","Variable","Equivalent Expression","Ordered Pair","Solution","Replace","Check"] },
          { id: "5-4", title: "Solve Systems by Elimination",
            terms: ["Elimination","System of Equations","Additive Inverses","Coefficient","Equivalent Equation","Ordered Pair","Solution","Combine Equations"] },
          { id: "5-MM", title: "Mathematical Modeling: Ups and Downs",
            terms: ["Mathematical Model","System of Equations","Rate of Change","Initial Value","Intersection","Constraint","Solution","Real-World Context"] }
        ]
      },
      {
        id: "8-T6", n: 6, title: "Congruence and Similarity",
        lessons: [
          { id: "6-1", title: "Analyze Translations",
            terms: ["Translation","Transformation","Preimage","Image","Coordinate Rule","Horizontal Shift","Vertical Shift","Rigid Motion"] },
          { id: "6-2", title: "Analyze Reflections",
            terms: ["Reflection","Line of Reflection","Mirror Image","Preimage","Image","Transformation","Coordinate Rule","Rigid Motion"] },
          { id: "6-3", title: "Analyze Rotations",
            terms: ["Rotation","Center of Rotation","Angle of Rotation","Clockwise","Counterclockwise","Preimage","Image","Rigid Motion"] },
          { id: "6-4", title: "Compose Transformations",
            terms: ["Composition of Transformations","Translation","Reflection","Rotation","Sequence","Preimage","Image","Mapping"] },
          { id: "6-5", title: "Understand Congruent Figures",
            terms: ["Congruent Figures","Corresponding Parts","Corresponding Angles","Corresponding Sides","Rigid Motion","Transformation","Same Size","Same Shape"] },
          { id: "6-6", title: "Describe Dilations",
            terms: ["Dilation","Scale Factor","Center of Dilation","Enlargement","Reduction","Preimage","Image","Proportional Sides"] },
          { id: "6-7", title: "Understand Similar Figures",
            terms: ["Similar Figures","Corresponding Angles","Corresponding Sides","Scale Factor","Proportion","Dilation","Same Shape","Proportional Lengths"] },
          { id: "6-8", title: "Understand Angle Relationships",
            terms: ["Parallel Lines","Transversal","Corresponding Angles","Alternate Interior Angles","Alternate Exterior Angles","Same-Side Interior Angles","Vertical Angles","Supplementary Angles"] },
          { id: "6-9", title: "Understand the Angle-Angle Criterion for Similarity",
            terms: ["Angle-Angle Criterion","Similar Triangles","Corresponding Angles","Corresponding Sides","Proportion","Triangle","Congruent Angles","Similarity"] },
          { id: "6-10", title: "Apply Congruence and Similarity",
            terms: ["Congruence","Similarity","Transformation","Scale Factor","Corresponding Parts","Indirect Measurement","Proportion","Rigid Motion"] }
        ]
      },
      {
        id: "8-T7", n: 7, title: "Understand and Apply the Pythagorean Theorem",
        lessons: [
          { id: "7-1", title: "Understand the Pythagorean Theorem",
            terms: ["Pythagorean Theorem","Right Triangle","Hypotenuse","Leg","Square","Area","Equation","a^2+b^2=c^2"] },
          { id: "7-2", title: "Understand the Converse of the Pythagorean Theorem",
            terms: ["Converse","Pythagorean Theorem","Right Triangle","Acute Triangle","Obtuse Triangle","Hypotenuse","Side Length","Classify"] },
          { id: "7-3", title: "Apply the Pythagorean Theorem",
            terms: ["Pythagorean Theorem","Hypotenuse","Leg","Right Triangle","Unknown Length","Square Root","Equation","Solution"] },
          { id: "7-4", title: "Find Distances in the Coordinate Plane",
            terms: ["Coordinate Plane","Distance","Ordered Pair","Horizontal Distance","Vertical Distance","Pythagorean Theorem","Line Segment","Square Root"] },
          { id: "7-5", title: "Solve Real-World Problems Using the Pythagorean Theorem",
            terms: ["Pythagorean Theorem","Right Triangle","Diagonal","Hypotenuse","Leg","Distance","Mathematical Model","Real-World Problem"] }
        ]
      },
      {
        id: "8-T8", n: 8, title: "Solve Problems Involving Surface Area and Volume",
        lessons: [
          { id: "8-1", title: "Find the Surface Area of Cylinders",
            terms: ["Cylinder","Surface Area","Lateral Area","Circular Base","Radius","Diameter","Height","Net"] },
          { id: "8-2", title: "Find the Surface Area of Cones",
            terms: ["Cone","Surface Area","Lateral Area","Slant Height","Radius","Circular Base","Vertex","Net"] },
          { id: "8-3", title: "Find the Surface Area of Spheres",
            terms: ["Sphere","Surface Area","Radius","Diameter","Center","Pi","Great Circle","Square Units"] },
          { id: "8-4", title: "Find the Volume of Cylinders",
            terms: ["Cylinder","Volume","Base Area","Radius","Diameter","Height","Cubic Units","Pi"] },
          { id: "8-5", title: "Find the Volume of Cones",
            terms: ["Cone","Volume","Radius","Height","Circular Base","One-Third","Cubic Units","Pi"] },
          { id: "8-6", title: "Find the Volume of Spheres",
            terms: ["Sphere","Volume","Radius","Diameter","Center","Cubic Units","Pi","Formula"] },
          { id: "8-7", title: "Solve Problems Involving Composite Solids",
            terms: ["Composite Solid","Cylinder","Cone","Sphere","Surface Area","Volume","Decompose","Cubic Units","Overlapping Parts"] }
        ]
      }
    ]
  }
};


/* =====================================================================
   HELPERS — the game engine uses these; do not duplicate this logic.
   ===================================================================== */

const MAX_GRID = 16;   // longest word we will ever hide in a grid
const MIN_GRID = 10;   // smallest grid we will ever build

/** Strip to uppercase letters only. "x-axis" -> "XAXIS" */
function gridForm(term) {
  return term.toUpperCase().replace(/[^A-Z]/g, "");
}

/* ---------------------------------------------------------------------
   ANCHOR-WORD RESOLVER

   The problem: "Multiplication Property of Inequality" is 34 letters.
   No classroom-readable grid can hide it. But the four inequality
   properties differ by exactly one word, and that word is the entire
   point of the lesson. So we hide the DISTINGUISHING word and show the
   full phrase as the clue:

       Word bank shows:  [MULTIPLICATION] Property of Inequality
       Grid contains:    MULTIPLICATION

   The student still has to read and understand the full term. They just
   hunt the part that carries the meaning.

   Resolution order, per lesson:
     1. Explicit override in TERMS (.g)
     2. Full phrase, if it fits and is unambiguous in this lesson
     3. Longest word in the phrase that fits and is unambiguous
     4. Any word in the phrase that fits and is unambiguous
     5. Clue-only (shown as a bonus card, never placed)

   "Unambiguous in this lesson" means: not identical to another grid word
   in the same puzzle, AND not a substring of one. INTEGER inside
   INTEGERS would let a student select the wrong span and be marked
   wrong for a correct answer — exactly the kind of tool-error-masking-
   as-math-error that has no place in a teaching tool.
   --------------------------------------------------------------------- */

function resolveGridWords(termKeys, maxLen = MAX_GRID) {
  const taken = new Set();

  /* How many OTHER terms in this lesson also contain this word?
     "Inequality" appears in all four property terms -> score 3, useless
     as an anchor. "Multiplication" appears in one -> score 0, perfect.
     Low score wins: the anchor must be the word that distinguishes. */
  const shared = (word, selfKey) =>
    termKeys.filter(k => k !== selfKey && gridForm(k).includes(word)).length;

  const order = [...termKeys].sort(
    (a, b) => gridForm(b).length - gridForm(a).length
  );

  const resolved = {};
  for (const key of order) {
    const meta = TERMS[key] || {};
    const full = gridForm(key);
    let chosen = null, partial = false;

    if (meta.g) {
      chosen = gridForm(meta.g);
      partial = chosen !== full;
    } else if (!meta.x && full.length <= maxLen && !taken.has(full)) {
      chosen = full;
    } else if (!meta.x) {
      const pick = key.split(/[\s\-]+/)
        .map(gridForm)
        .filter(w => w.length >= 3 && w.length <= maxLen && !taken.has(w))
        .sort((a, b) =>
          shared(a, key) - shared(b, key) ||   // most distinguishing first
          b.length - a.length                  // then longest
        )[0];
      if (pick) { chosen = pick; partial = true; }
    }

    if (chosen) taken.add(chosen);
    resolved[key] = {
      key,
      display: key,
      grid: chosen,
      partial,                       // true = word bank highlights the hidden part
      def: meta.d,
      ex: meta.e || null,
      clueOnly: !chosen
    };
  }

  return termKeys.map(k => resolved[k]);
}

/** Everything the game needs to build one lesson's puzzle. */
function buildLesson(grade, topicId, lessonId) {
  const topic = CURRICULUM[grade].topics.find(t => t.id === topicId);
  const lesson = topic.lessons.find(l => l.id === lessonId);
  const terms = resolveGridWords(lesson.terms);
  const placeable = terms.filter(t => !t.clueOnly);
  const longest = placeable.reduce((m, t) => Math.max(m, t.grid.length), 0);
  return {
    grade, topic, lesson,
    label: `Grade ${grade} · Lesson ${lesson.id} · ${lesson.title}`,
    terms,
    placeable,
    clueOnly: terms.filter(t => t.clueOnly),
    gridSize: Math.max(MIN_GRID, Math.min(MAX_GRID + 2, longest + 2)),
    thin: placeable.length < 4          // engine should offer Combine Mode
  };
}

/** Startup integrity check. Anything returned here is a content bug. */
function auditCurriculum() {
  const problems = [];
  for (const g of Object.keys(CURRICULUM)) {
    for (const topic of CURRICULUM[g].topics) {
      for (const lesson of topic.lessons) {
        for (const key of lesson.terms) {
          if (!TERMS[key]) problems.push(`${g} ${lesson.id}: missing TERMS entry "${key}"`);
        }
        if (topic.incomplete) continue;
        if (!lesson.terms.length) { problems.push(`${g} ${lesson.id}: no terms`); continue; }
        const built = buildLesson(g, topic.id, lesson.id);
        if (!built.placeable.length) problems.push(`${g} ${lesson.id}: NOTHING placeable — unplayable`);
        else if (built.thin) problems.push(`${g} ${lesson.id}: only ${built.placeable.length} placeable — Combine Mode required`);
      }
    }
  }
  return problems;
}

if (typeof module !== "undefined") module.exports = { TERMS, CURRICULUM, MAX_GRID, MIN_GRID, gridForm, resolveGridWords, buildLesson, auditCurriculum };
