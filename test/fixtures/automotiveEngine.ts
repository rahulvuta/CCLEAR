// Regression passages from https://en.wikipedia.org/wiki/Automotive_engine,
// read September 9, 2026 (CC BY-SA 4.0). These test fidelity to the page, not
// whether the page's historical and technical claims are independently correct.
export const automotiveEngine = [
  {
    id: 'lead',
    text: 'There are a variety of propulsion systems available or potentially available for automobiles and other vehicles. Options included internal combustion engines (ICE) fueled by petrol, diesel, propane, or natural gas; hybrid vehicles, plug-in hybrids, fuel cell vehicles fueled by hydrogen and all electric cars. Fueled vehicles seem to have the advantage due to the limited range and high cost of batteries. Some options required construction of a network of fueling or charging stations. With no compelling advantage for any particular option, car makers pursued parallel development tracks using a variety of options. Reducing the weight of vehicles was one strategy being employed.',
    required: [/ICE|internal combustion/i, /hybrid/i, /plug.in/i, /fuel.cell/i, /electric/i, /batter/i, /petrol|gasoline/i, /diesel/i, /propane/i, /natural gas/i, /hydrogen/i]
  },
  {
    id: 'recent',
    text: 'The use of high-technology (such as electronic engine control units) in advanced designs resulting from substantial investments in development research by European countries and Japan seemed to give an advantage to them over Chinese automakers and parts suppliers who, as of 2013, had low development budgets and lacked capacity to produce parts for high-tech engine and power train designs.',
    required: [/2013/, /Europ/i, /Japan/i, /Chin/i, /budget|invest|research/i, /seem|appear/i]
  },
  {
    id: 'early-history',
    text: 'In the early years, steam engines and electric motors were tried, but with limited success. In the 20th century, the internal combustion engine (ICE), became dominant. In 2015, the internal combustion engine remains the most widely used but a resurgence of electricity seems likely because of increasing concern about ICE engine exhaust gas emissions.',
    required: [/steam/i, /electric/i, /20th/, /2015/, /dominant|dominat|most.*used/i, /emission/i]
  },
  {
    id: 'history',
    text: 'As of 2017, the majority of the cars in the United States are gasoline powered. In the early 1900s, the internal combustion engines faced competition from steam engines and electric motors. The internal combustion engines of the time were powered by gasoline. Internal combustion engines function with the concept of a piston being pushed by the pressure of a certain explosion. This explosion is burning the hydrocarbon within the cylinder of an engine. Out of all the cars manufactured during the time, only around one fourth are actually considered internal combustion. Within the next couple of years, the internal combustion engine came out to become the most popular automotive engine. Sometime within the 19th century, Rudolf Diesel invented a new form of internal combustion power, using a concept of injecting liquid fuel into air heated solely by compression. This is the predecessor to the modern diesel engine used in automobiles, but more specifically, heavy duty vehicles such as semi-trucks.',
    required: [/steam/i, /electric/i, /piston/i, /cylinder/i, /Rudolf Diesel/, /compression/i, /fourth|quarter/i]
  },
  {
    id: 'petrol-history',
    text: "Petrol engines quickly became the choice of manufacturers and consumers alike. Despite the rough start, noisy and dirty engine, and the difficult gear shifting, new technologies such as the production line and the advancement of the engine allowed the standard production of the gas automobiles. This is the start, from the invention of the gas automobile in 1876, to the beginning of mass production in the 1890s. Henry Ford's Model T drove down the price of cars to a more affordable price. At the same time, Charles Kettering invented an electric starter, allowing the engine to be started without the need for a mechanical hand crank. The abundance of fuel propelled gas automobiles to be highly capable and affordable. The demand of gasoline rose from 3 billion barrels in 1919 to around 15 billion in 1929.",
    required: [/Model T/, /Kettering/, /starter/i, /1876/, /1890s/, /3 billion/, /1919/, /15 billion/, /1929/]
  },
  {
    id: 'ice-definition',
    text: 'An internal combustion engine (ICE) is powered by the expansion of gas which is created by the combustion of hydrocarbon gases fuels. To elaborate, an internal combustion used the heat of a combustion created by the injected hydrocarbon fuel to create mechanical motion. At the time of the early 1900s, wood alcohol was a popular fuel for French and German automobiles, but as governments imposed large taxes on the production, the price of wood alcohol rose above that of gasoline. Gasoline engines became popular as a result of this, as ICE engines were commonly known as gasoline engines. Although gasoline engines became popular, they were not particularly desirable due to the dangers of fuel leaks that may cause explosions. Therefore, many inventors attempted to create a kerosene burning engine as a result. This was not a successful venture applying it for automotive usage. There are many different types of fuels for ICE engines. These include diesel, gasoline, and ethanol.',
    required: [/heat/i, /motion/i, /gas/i, /tax/i, /leak/i, /explosion/i, /kerosene/i, /diesel/i, /ethanol/i]
  },
  {
    id: 'stanley',
    text: 'The steam engine was invented in the late 1700s, and the primary method of powering engines and soon, locomotives. One of the most popular steam automobiles was the Stanley Steamer, offering low pollution, power, and speed. The downside of these steam automobiles is the unreliability, complexity, and the frequent accidents that occurred with them. The startup time for a steam car may take up to 45 minutes, defeating the purpose of faster transportation. By the time the steam automobile was improved, the complexity of manufacturing relative to the gas automobiles made steam automobiles unprofitable.',
    required: [/1700s/, /Stanley Steamer/, /45 minutes/, /accident/i, /unprofitable|profitab/i]
  },
  {
    id: 'steam-definition',
    text: "A steam engine is a device which transforms heat into mechanical motion. This is provided with the usage of boilers, which create steam by boiling water. In the early 1900s, Abner Doble introduced a steam-powered car in the United States which had capabilities that could potentially overpower Ford's Model T in efficiency. Steam has been known to have very efficient fuel economy with a high power source. That is why half the world was powered by steam for almost the entirety of the 19th century and almost half the 20th century. The main drawback of the steam engine in automobiles was that operators were required to have full knowledge of boilers and steam engines before operating, as it was detrimental to the engine itself if the operator neglected it.",
    required: [/heat/i, /motion/i, /boiler/i, /boil/i, /Abner Doble/, /19th/, /20th/, /operator/i]
  },
  {
    id: 'early-electric',
    text: 'Electric vehicles seemed to be the most viable option, similar to the steam automobiles. They were first invented in the early 1800s, and became a viable option of transportation around 1890, when William Morrison created the first electric car that traveled 14 miles per hour. The electric cars offered low pollution and a soundless ride, unlike their gasoline counterparts. The greatest downside of electric cars was the range. The typical electric car could reach around 20 miles before requiring a recharge. Manufacturers could not increase the number of batteries, due to the bulkiness of the batteries at the time. Without an incentive to purchase the electric automobiles, gas automobiles were the most viable option at the time.',
    required: [/1800s/, /1890/, /William Morrison/, /14 miles per hour|14 mph/, /20 miles/, /bulk/i]
  },
  {
    id: 'electric-definition',
    text: 'Electric cars use batteries to store electricity which is used to power electric motors. The battery delivers the power to the motor, which is either Alternating Current (AC) or Direct Current (DC). The difference between AC and DC motors is the sort of system that is required to run it in an electric vehicle. An AC motor is generally cheaper but the components required to run it in an electric vehicle such as the controller and inverter makes it more expensive than the DC motor. A unique feature of electric vehicles compared to its gasoline counterparts, the electric vehicle is more simple than the gasoline vehicle. The electric vehicle bypasses the gasoline car components such as the crankshaft which allows it to generate power much faster than gasoline. Because of the faster transfer of power, the electric vehicle is able to accelerate faster than gasoline cars.',
    required: [/batter/i, /AC/, /DC/, /controller/i, /inverter/i, /crankshaft/i, /accelerat/i]
  },
  {
    id: 'opec',
    text: 'In the 1970s, the electric vehicle made its reappearance because of the 1973 OPEC Oil Embargo. Previously, the abundant gasoline had become the prime source of fuel for vehicles. But after the shortage, manufacturers began looking towards electric vehicles again. Despite the improved technology from the 1800s, the electric vehicles faced similar technological flaws such as limited mileage and speed. They could only travel up to 45 miles per hour and had a range of approximately 40 miles.',
    required: [/1970s/, /1973/, /OPEC/, /1800s/, /45 miles per hour|45 mph/, /40 miles/]
  }
]
