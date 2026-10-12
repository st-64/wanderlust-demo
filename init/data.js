const sampleListings = [
    // ==================== 1. ODISHA (6 Listings) ====================

    {
        title: "Puri Golden Beach Sea-Facing Suite",
        description:
            "Wake up to ocean views on Puri's Golden Beach. Walking distance from Jagannath Temple with private balcony seating.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 4200,
        location: "Puri, Odisha",
        country: "India",
        city: "Puri",
        state: "Odisha",
        category: "Homes",
        type: "Beach",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [85.8249, 19.8135]
        }
    },

    {
        title: "Temple City Heritage Villa in Old Town",
        description:
            "A traditional villa tucked inside Old Town, Bhubaneswar. Surrounded by ancient Kalinga stone temples and peaceful courtyards.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 3800,
        location: "Bhubaneswar, Odisha",
        country: "India",
        city: "Bhubaneswar",
        state: "Odisha",
        category: "Homes",
        type: "Heritage",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [85.8245, 20.2961]
        }
    },

    {
        title: "Chilika Lagoon Island Eco-Cottage",
        description:
            "Serene waterfront cottage on Chilika Lake. Spot Irrawaddy dolphins and migratory birds right from your porch deck.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 4900,
        location: "Chilika, Odisha",
        country: "India",
        city: "Chilika",
        state: "Odisha",
        category: "Homes",
        type: "Lake",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [85.3333, 19.7]
        }
    },

    {
        title: "Konark Eco Retreat Luxury Glamping Tent",
        description:
            "Beachfront luxury glamping experience near Ramchandi Beach and the UNESCO World Heritage Konark Sun Temple.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 6500,
        location: "Konark, Odisha",
        country: "India",
        city: "Konark",
        state: "Odisha",
        category: "Homes",
        type: "Camping",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [86.0945, 19.8876]
        }
    },

    {
        title: "Colonial Beachfront House in Gopalpur",
        description:
            "Restored vintage seaside bungalow in the quiet historic port town of Gopalpur-on-Sea.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 3600,
        location: "Gopalpur, Odisha",
        country: "India",
        city: "Gopalpur",
        state: "Odisha",
        category: "Homes",
        type: "Beach",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [84.9, 19.2667]
        }
    },

    {
        title: "Simlipal Elephant & Tiger Reserve Lodge",
        description:
            "Eco-friendly jungle stay surrounded by dense Mayurbhanj sal forests and natural waterfalls.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1518684079-3c830dcef090?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 3200,
        location: "Mayurbhanj, Odisha",
        country: "India",
        city: "Mayurbhanj",
        state: "Odisha",
        category: "Homes",
        type: "Countryside",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [86.3333, 21.8333]
        }
    },


    // ==================== 2. GOA (6 Listings) ====================

    {
        title: "Beachfront Villa at Baga Beach",
        description:
            "Step directly onto the golden sands of Baga Beach. Features a private plunge pool, sun deck, and sea-view balcony.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 7500,
        location: "Baga, Goa",
        country: "India",
        city: "Baga",
        state: "Goa",
        category: "Homes",
        type: "Beach",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [73.7517, 15.5524]
        }
    },

    {
        title: "Portuguese Heritage Villa in Fontainhas",
        description:
            "A beautifully restored 19th-century Portuguese home in the Latin Quarter of Panaji with vibrant yellow walls and tiled courtyards.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 5200,
        location: "Panaji, Goa",
        country: "India",
        city: "Panaji",
        state: "Goa",
        category: "Homes",
        type: "Heritage",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [73.8315, 15.4989]
        }
    },

    {
        title: "Luxury Jungle Pool Villa in Anjuna",
        description:
            "Secluded luxury villa hidden among lush tropical greenery. Minutes away from Anjuna flea market and nightlife.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 8900,
        location: "Anjuna, Goa",
        country: "India",
        city: "Anjuna",
        state: "Goa",
        category: "Homes",
        type: "Amazing Pools",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [73.7431, 15.5869]
        }
    },

    {
        title: "Cliffside Sunset Studio in Vagator",
        description:
            "Panoramic views of the Arabian Sea from your private terrace. Ideal for couples seeking romantic sunsets.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 4200,
        location: "Vagator, Goa",
        country: "India",
        city: "Vagator",
        state: "Goa",
        category: "Homes",
        type: "Beach",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [73.7339, 15.603]
        }
    },

    {
        title: "Eco Eco-Bamboo Huts at Palolem",
        description:
            "Rustic yet comfortable sustainable bamboo cottages nestled under coconut palms in South Goa.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 3500,
        location: "Palolem, Goa",
        country: "India",
        city: "Palolem",
        state: "Goa",
        category: "Homes",
        type: "Camping",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [74.0232, 15.01]
        }
    },

    {
        title: "Riverfront Estate in Candolim",
        description:
            "Luxury waterfront villa overlooking the Nerul River with personal chef services and private boat deck.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1613977257363-707ba9348227?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 9500,
        location: "Candolim, Goa",
        country: "India",
        city: "Candolim",
        state: "Goa",
        category: "Homes",
        type: "Lake",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [73.7686, 15.5173]
        }
    },


    // ==================== 3. HIMACHAL PRADESH (5 Listings) ====================

    {
        title: "Himalayan Cedar Wood Chalet",
        description:
            "Cozy timber chalet surrounded by dense pine forests with unobstructed snow-capped peak views.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 4500,
        location: "Manali, Himachal Pradesh",
        country: "India",
        city: "Manali",
        state: "Himachal Pradesh",
        category: "Homes",
        type: "Mountains",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [77.1887, 32.2432]
        }
    },

    {
        title: "British Colonial Cottage in Shimla",
        description:
            "Heritage bungalow featuring stone fireplaces, wooden floors, and a Victorian tea garden overlooking the hills.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1587061949409-02df41d5e562?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 5000,
        location: "Shimla, Himachal Pradesh",
        country: "India",
        city: "Shimla",
        state: "Himachal Pradesh",
        category: "Homes",
        type: "Heritage",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [77.1734, 31.1048]
        }
    },

    {
        title: "Monastery View Loft in McLeod Ganj",
        description:
            "Peaceful retreat with Tibetan prayer wheel decor and clear vistas of the Dhauladhar mountain range.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 3200,
        location: "Dharamshala, Himachal Pradesh",
        country: "India",
        city: "Dharamshala",
        state: "Himachal Pradesh",
        category: "Homes",
        type: "Mountains",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [76.324, 32.2426]
        }
    },

    {
        title: "Riverside Stone House in Parvati Valley",
        description:
            "Traditional Himalayan stone and wood house situated along the rushing Parvati River in Kasol.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 2800,
        location: "Kasol, Himachal Pradesh",
        country: "India",
        city: "Kasol",
        state: "Himachal Pradesh",
        category: "Homes",
        type: "Mountains",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [77.315, 32.01]
        }
    },

    {
        title: "Apple Orchard Homestay in Jibhi",
        description:
            "Rustic wooden cabin located inside an active organic apple orchard. Includes fresh home-cooked Himachali meals.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1510798831971-661eb04b3739?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 3800,
        location: "Jibhi, Himachal Pradesh",
        country: "India",
        city: "Jibhi",
        state: "Himachal Pradesh",
        category: "Homes",
        type: "Countryside",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [77.3483, 31.6375]
        }
    },


    // ==================== 4. RAJASTHAN (6 Listings) ====================

    {
        title: "Royal Heritage Haveli in Pink City",
        description:
            "Experience authentic Rajput royal hospitality in a restored 18th-century heritage haveli with courtyard dining.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1599661046289-e31897846e41?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 6200,
        location: "Jaipur, Rajasthan",
        country: "India",
        city: "Jaipur",
        state: "Rajasthan",
        category: "Homes",
        type: "Heritage",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [75.8185, 26.9124]
        }
    },

    {
        title: "Thar Desert Luxury Glamping Tent",
        description:
            "Luxury Swiss tent setup in the Sam Sand Dunes with evening folk music, camel safaris, and stargazing.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 5500,
        location: "Jaisalmer, Rajasthan",
        country: "India",
        city: "Jaisalmer",
        state: "Rajasthan",
        category: "Homes",
        type: "Camping",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [70.9126, 26.9157]
        }
    },

    {
        title: "Lake Pichola Water Palace Suite",
        description:
            "Unmatched lake views directly facing Jag Mandir and Lake Palace in the City of Lakes.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1615874959474-d60996b7d726?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 9800,
        location: "Udaipur, Rajasthan",
        country: "India",
        city: "Udaipur",
        state: "Rajasthan",
        category: "Homes",
        type: "Lake",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [73.6833, 24.5854]
        }
    },

    {
        title: "Blue City Fort View Haveli",
        description:
            "Rooftop dining with direct view of Mehrangarh Fort towering above Jodhpur's blue houses.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1566073771259-6a8506099945?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 4800,
        location: "Jodhpur, Rajasthan",
        country: "India",
        city: "Jodhpur",
        state: "Rajasthan",
        category: "Homes",
        type: "Heritage",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [73.0243, 26.2389]
        }
    },

    {
        title: "Sacred Lake Villa in Pushkar",
        description:
            "Peaceful desert retreat located within walking distance of Pushkar Lake and Brahma Temple.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 3100,
        location: "Pushkar, Rajasthan",
        country: "India",
        city: "Pushkar",
        state: "Rajasthan",
        category: "Homes",
        type: "Lake",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [74.5511, 26.4897]
        }
    },

    {
        title: "Ranthambore Wildlife Safari Lodge",
        description:
            "Luxury eco-lodge at the edge of Ranthambore National Park. Perfect base for Bengal tiger safaris.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 7200,
        location: "Sawai Madhopur, Rajasthan",
        country: "India",
        city: "Sawai Madhopur",
        state: "Rajasthan",
        category: "Homes",
        type: "Countryside",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [76.5026, 25.9928]
        }
    },


    // ==================== 5. KERALA (5 Listings) ====================

    {
        title: "Traditional Alleppey Backwater Houseboat",
        description:
            "Private air-conditioned houseboat with an onboard personal chef cruising through Alleppey's quiet palm-fringed canals.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 8000,
        location: "Alleppey, Kerala",
        country: "India",
        city: "Alleppey",
        state: "Kerala",
        category: "Homes",
        type: "Lake",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [76.3388, 9.4981]
        }
    },

    {
        title: "Misty Tea Plantation Bungalow",
        description:
            "Colonial-style estate surrounded by endless rolling tea plantations in cool, hilly Munnar.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1566073771259-6a8506099945?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 5400,
        location: "Munnar, Kerala",
        country: "India",
        city: "Munnar",
        state: "Kerala",
        category: "Homes",
        type: "Countryside",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [77.0597, 10.0889]
        }
    },

    {
        title: "Heritage Spice Villa in Fort Kochi",
        description:
            "Dutch-influenced vintage bungalow walking distance from Chinese fishing nets and art cafes.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 4200,
        location: "Kochi, Kerala",
        country: "India",
        city: "Kochi",
        state: "Kerala",
        category: "Homes",
        type: "Heritage",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [76.2424, 9.9658]
        }
    },

    {
        title: "Varkala Cliffside Ocean Resort",
        description:
            "Perched high above Varkala Cliff with stairs leading directly down to Papanasam Beach.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 4600,
        location: "Varkala, Kerala",
        country: "India",
        city: "Varkala",
        state: "Kerala",
        category: "Homes",
        type: "Beach",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [76.7163, 8.7379]
        }
    },

    {
        title: "Rainforest Treehouse in Wayanad",
        description:
            "Live high up in the green canopy of Wayanad's tropical forest. Equipped with modern amenities and safety.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1488462237308-ecaa28b729d7?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 6500,
        location: "Wayanad, Kerala",
        country: "India",
        city: "Wayanad",
        state: "Kerala",
        category: "Homes",
        type: "Countryside",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [76.132, 11.6854]
        }
    },


    // ==================== 6. UTTARAKHAND (2 Listings) ====================

    {
        title: "Riverside Glamping Dome in Rishikesh",
        description:
            "Geodesic dome setup by the Ganges. Ideal for yoga retreats, white-water rafting, and night campfires.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 3900,
        location: "Rishikesh, Uttarakhand",
        country: "India",
        city: "Rishikesh",
        state: "Uttarakhand",
        category: "Homes",
        type: "Camping",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [78.2676, 30.0869]
        }
    },

    {
        title: "Naini Lake View Wooden Cabin",
        description:
            "Charming hillside wooden cottage overlooking Naini Lake. Walking distance from Mall Road.",
        image: {
            filename: "listingimage",
            url: "https://images.unsplash.com/photo-1578645510447-e20b4311e3ce?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60"
        },
        price: 4800,
        location: "Nainital, Uttarakhand",
        country: "India",
        city: "Nainital",
        state: "Uttarakhand",
        category: "Homes",
        type: "Lake",
        priceUnit: "night",
        geometry: {
            type: "Point",
            coordinates: [79.4588, 29.3803]
        }
    },

    // ==================== EXPERIENCES ====================

    {
        title: "Puri Sunrise & Heritage Walk",
        description: "A small-group sunrise walk through Puri's old streets, local culture and coastal landmarks.",
        image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1518002054494-3a6f94352e9a?auto=format&fit=crop&w=800&q=60" },
        price: 1200,
        priceUnit: "person",
        location: "Puri, Odisha",
        city: "Puri",
        state: "Odisha",
        country: "India",
        category: "Experiences",
        type: "Culture",
        geometry: { type: "Point", coordinates: [85.8249, 19.8135] }
    },

    {
        title: "Goa Coastal Food & Market Tour",
        description: "Explore local markets and sample a curated selection of Goan coastal dishes with a local host.",
        image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=60" },
        price: 1800,
        priceUnit: "person",
        location: "Panaji, Goa",
        city: "Panaji",
        state: "Goa",
        country: "India",
        category: "Experiences",
        type: "Food",
        geometry: { type: "Point", coordinates: [73.8278, 15.4909] }
    },

    {
        title: "Munnar Tea Estate Nature Walk",
        description: "A guided walk through tea-growing landscapes with viewpoints, local stories and photography stops.",
        image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?auto=format&fit=crop&w=800&q=60" },
        price: 1500,
        priceUnit: "person",
        location: "Munnar, Kerala",
        city: "Munnar",
        state: "Kerala",
        country: "India",
        category: "Experiences",
        type: "Nature",
        geometry: { type: "Point", coordinates: [77.0595, 10.0889] }
    },

    {
        title: "Jaipur Old City Craft & Culture Tour",
        description: "Discover traditional crafts, historic lanes and everyday culture around Jaipur's old city.",
        image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1477587458883-47145ed94245?auto=format&fit=crop&w=800&q=60" },
        price: 1600,
        priceUnit: "person",
        location: "Jaipur, Rajasthan",
        city: "Jaipur",
        state: "Rajasthan",
        country: "India",
        category: "Experiences",
        type: "Culture",
        geometry: { type: "Point", coordinates: [75.7873, 26.9124] }
    },

    // ==================== SERVICES ====================

    {
        title: "Private Chef — Odia Home Dinner",
        description: "A private home-style Odia dinner prepared for your group using familiar regional flavours.",
        image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=800&q=60" },
        price: 2200,
        priceUnit: "service",
        location: "Bhubaneswar, Odisha",
        city: "Bhubaneswar",
        state: "Odisha",
        country: "India",
        category: "Services",
        type: "Chef",
        geometry: { type: "Point", coordinates: [85.8245, 20.2961] }
    },

    {
        title: "Goa Vacation Photography Session",
        description: "A private outdoor photography session around selected beaches and neighbourhoods in Goa.",
        image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1542038784456-1ea8e935640e?auto=format&fit=crop&w=800&q=60" },
        price: 3000,
        priceUnit: "service",
        location: "Baga, Goa",
        city: "Baga",
        state: "Goa",
        country: "India",
        category: "Services",
        type: "Photography",
        geometry: { type: "Point", coordinates: [73.7517, 15.5557] }
    },

    {
        title: "Airport Pickup & Local Transfer",
        description: "Pre-arranged private transfer service for guests travelling around the Goa region.",
        image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=800&q=60" },
        price: 1400,
        priceUnit: "service",
        location: "Panaji, Goa",
        city: "Panaji",
        state: "Goa",
        country: "India",
        category: "Services",
        type: "Transport",
        geometry: { type: "Point", coordinates: [73.8278, 15.4909] }
    },

    {
        title: "Private Wellness Session in Rishikesh",
        description: "A private introductory wellness session designed around relaxation and mindful movement.",
        image: { filename: "listingimage", url: "https://images.unsplash.com/photo-1545205597-3d9d02c29597?auto=format&fit=crop&w=800&q=60" },
        price: 1800,
        priceUnit: "service",
        location: "Rishikesh, Uttarakhand",
        city: "Rishikesh",
        state: "Uttarakhand",
        country: "India",
        category: "Services",
        type: "Wellness",
        geometry: { type: "Point", coordinates: [78.2676, 30.0869] }
    },
];

module.exports = { data: sampleListings };