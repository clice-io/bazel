export module shapes;

import std;

export struct Square {
  double side;
  double area() const { return side * side; }
};

export std::string describe(const Square& s) { return std::format("square of {}", s.area()); }
