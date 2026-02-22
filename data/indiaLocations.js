const indiaLocations = [
  {
    state: 'Andhra Pradesh',
    stateCode: 'AP',
    cities: [
      'Visakhapatnam',
      'Vijayawada',
      'Guntur',
      'Nellore',
      'Kakinada',
      'Tirupati',
      'Rajahmundry',
      'Anantapur'
    ]
  },
  {
    state: 'Arunachal Pradesh',
    stateCode: 'AR',
    cities: ['Itanagar', 'Tawang', 'Ziro', 'Pasighat', 'Naharlagun', 'Bomdila']
  },
  {
    state: 'Assam',
    stateCode: 'AS',
    cities: ['Guwahati', 'Dibrugarh', 'Silchar', 'Jorhat', 'Tezpur', 'Tinsukia', 'Sivasagar']
  },
  {
    state: 'Bihar',
    stateCode: 'BR',
    cities: [
      'Patna',
      'Gaya',
      'Bhagalpur',
      'Muzaffarpur',
      'Purnia',
      'Darbhanga',
      'Ara',
      'Begusarai'
    ]
  },
  {
    state: 'Chhattisgarh',
    stateCode: 'CG',
    cities: ['Raipur', 'Bilaspur', 'Durg', 'Bhilai', 'Korba', 'Rajnandgaon', 'Jagdalpur']
  },
  {
    state: 'Goa',
    stateCode: 'GA',
    cities: ['Panaji', 'Margao', 'Vasco Da Gama', 'Ponda', 'Mapusa', 'Calangute']
  },
  {
    state: 'Gujarat',
    stateCode: 'GJ',
    cities: [
      'Ahmedabad',
      'Surat',
      'Vadodara',
      'Rajkot',
      'Bhavnagar',
      'Jamnagar',
      'Junagadh',
      'Gandhinagar'
    ]
  },
  {
    state: 'Haryana',
    stateCode: 'HR',
    cities: [
      'Gurugram',
      'Faridabad',
      'Panipat',
      'Ambala',
      'Karnal',
      'Hisar',
      'Rohtak',
      'Sonipat'
    ]
  },
  {
    state: 'Himachal Pradesh',
    stateCode: 'HP',
    cities: ['Shimla', 'Dharamshala', 'Manali', 'Solan', 'Mandi', 'Kullu', 'Kangra', 'Hamirpur']
  },
  {
    state: 'Jharkhand',
    stateCode: 'JH',
    cities: ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro', 'Deoghar', 'Hazaribagh', 'Giridih']
  },
  {
    state: 'Karnataka',
    stateCode: 'KA',
    cities: [
      'Bengaluru',
      'Mysuru',
      'Mangaluru',
      'Hubballi',
      'Belagavi',
      'Davanagere',
      'Tumakuru',
      'Shivamogga'
    ]
  },
  {
    state: 'Kerala',
    stateCode: 'KL',
    cities: [
      'Thiruvananthapuram',
      'Kochi',
      'Kozhikode',
      'Thrissur',
      'Kollam',
      'Kannur',
      'Kottayam',
      'Alappuzha'
    ]
  },
  {
    state: 'Madhya Pradesh',
    stateCode: 'MP',
    cities: [
      'Indore',
      'Bhopal',
      'Gwalior',
      'Jabalpur',
      'Ujjain',
      'Sagar',
      'Satna',
      'Rewa'
    ]
  },
  {
    state: 'Maharashtra',
    stateCode: 'MH',
    cities: [
      'Mumbai',
      'Pune',
      'Nagpur',
      'Nashik',
      'Thane',
      'Aurangabad',
      'Kolhapur',
      'Solapur'
    ]
  },
  {
    state: 'Manipur',
    stateCode: 'MN',
    cities: ['Imphal', 'Churachandpur', 'Thoubal', 'Ukhrul', 'Senapati', 'Bishnupur']
  },
  {
    state: 'Meghalaya',
    stateCode: 'ML',
    cities: ['Shillong', 'Tura', 'Jowai', 'Nongpoh', 'Baghmara', 'Williamnagar']
  },
  {
    state: 'Mizoram',
    stateCode: 'MZ',
    cities: ['Aizawl', 'Lunglei', 'Champhai', 'Serchhip', 'Kolasib', 'Mamit']
  },
  {
    state: 'Nagaland',
    stateCode: 'NL',
    cities: ['Kohima', 'Dimapur', 'Mokokchung', 'Tuensang', 'Wokha', 'Zunheboto']
  },
  {
    state: 'Odisha',
    stateCode: 'OD',
    cities: [
      'Bhubaneswar',
      'Cuttack',
      'Rourkela',
      'Sambalpur',
      'Berhampur',
      'Balasore',
      'Puri',
      'Bhadrak'
    ]
  },
  {
    state: 'Punjab',
    stateCode: 'PB',
    cities: [
      'Ludhiana',
      'Amritsar',
      'Jalandhar',
      'Patiala',
      'Bathinda',
      'Mohali',
      'Hoshiarpur',
      'Pathankot'
    ]
  },
  {
    state: 'Rajasthan',
    stateCode: 'RJ',
    cities: [
      'Jaipur',
      'Jodhpur',
      'Udaipur',
      'Kota',
      'Ajmer',
      'Bikaner',
      'Alwar',
      'Bhilwara'
    ]
  },
  {
    state: 'Sikkim',
    stateCode: 'SK',
    cities: ['Gangtok', 'Namchi', 'Gyalshing', 'Mangan', 'Rangpo', 'Ravangla']
  },
  {
    state: 'Tamil Nadu',
    stateCode: 'TN',
    cities: [
      'Chennai',
      'Coimbatore',
      'Madurai',
      'Tiruchirappalli',
      'Salem',
      'Erode',
      'Vellore',
      'Tirunelveli'
    ]
  },
  {
    state: 'Telangana',
    stateCode: 'TG',
    cities: [
      'Hyderabad',
      'Warangal',
      'Nizamabad',
      'Karimnagar',
      'Khammam',
      'Sangareddy',
      'Mahbubnagar',
      'Siddipet'
    ]
  },
  {
    state: 'Tripura',
    stateCode: 'TR',
    cities: ['Agartala', 'Udaipur', 'Dharmanagar', 'Kailashahar', 'Ambassa', 'Belonia']
  },
  {
    state: 'Uttar Pradesh',
    stateCode: 'UP',
    cities: [
      'Lucknow',
      'Kanpur',
      'Ghaziabad',
      'Agra',
      'Varanasi',
      'Prayagraj',
      'Meerut',
      'Noida',
      'Bareilly',
      'Gorakhpur'
    ]
  },
  {
    state: 'Uttarakhand',
    stateCode: 'UK',
    cities: [
      'Dehradun',
      'Haridwar',
      'Rishikesh',
      'Haldwani',
      'Roorkee',
      'Rudrapur',
      'Almora',
      'Nainital'
    ]
  },
  {
    state: 'West Bengal',
    stateCode: 'WB',
    cities: [
      'Kolkata',
      'Howrah',
      'Durgapur',
      'Siliguri',
      'Asansol',
      'Kharagpur',
      'Bardhaman',
      'Malda'
    ]
  },
  {
    state: 'Delhi',
    stateCode: 'DL',
    cities: ['New Delhi', 'Dwarka', 'Rohini', 'Connaught Place', 'Saket', 'Karol Bagh', 'Laxmi Nagar']
  },
  {
    state: 'Jammu and Kashmir',
    stateCode: 'JK',
    cities: [
      'Srinagar',
      'Jammu',
      'Anantnag',
      'Baramulla',
      'Kathua',
      'Udhampur',
      'Kupwara',
      'Pulwama'
    ]
  },
  {
    state: 'Ladakh',
    stateCode: 'LA',
    cities: ['Leh', 'Kargil', 'Nubra', 'Zanskar', 'Drass', 'Nyoma']
  },
  {
    state: 'Chandigarh',
    stateCode: 'CH',
    cities: ['Chandigarh']
  },
  {
    state: 'Andaman and Nicobar Islands',
    stateCode: 'AN',
    cities: ['Port Blair', 'Havelock Island', 'Neil Island', 'Diglipur', 'Rangat', 'Mayabunder']
  },
  {
    state: 'Lakshadweep',
    stateCode: 'LD',
    cities: ['Kavaratti', 'Agatti', 'Minicoy', 'Amini', 'Kalpeni', 'Andrott']
  },
  {
    state: 'Puducherry',
    stateCode: 'PY',
    cities: ['Puducherry', 'Karaikal', 'Mahe', 'Yanam']
  },
  {
    state: 'Dadra and Nagar Haveli and Daman and Diu',
    stateCode: 'DN',
    cities: ['Daman', 'Diu', 'Silvassa', 'Vapi', 'Naroli', 'Khanvel']
  }
];

module.exports = indiaLocations;

