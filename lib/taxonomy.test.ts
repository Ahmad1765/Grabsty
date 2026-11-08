import { describe, it, expect } from 'vitest';
import {
  getBrandsForCategory,
  getRecommendedBrandsForCategory,
  getCategoryCodesForSelection,
  smartClassify,
} from './taxonomy';
import { CATEGORIES } from './categories';
import { CATEGORY_VALUES } from './schemas/sell';

describe('Category & Brand Relevance Algorithm', () => {
  it('strictly returns footwear brands when Shoes category is selected', () => {
    const shoeBrands = getBrandsForCategory('shoes');
    expect(shoeBrands.length).toBeGreaterThan(0);

    const brandNames = shoeBrands.map((b) => b.name);

    // Should include prominent footwear brands
    expect(brandNames).toContain('Nike');
    expect(brandNames).toContain('Adidas');
    expect(brandNames).toContain('Puma');
    expect(brandNames).toContain('Bata');
    expect(brandNames).toContain('Servis');
    expect(brandNames).toContain('Borjan');
    expect(brandNames).toContain('Stylo');
    expect(brandNames).toContain('ECS');
    expect(brandNames).toContain('Insignia');
    expect(brandNames).toContain('Hush Puppies');
    expect(brandNames).toContain('New Balance');

    // Should NOT include pure clothing/lawn brands
    expect(brandNames).not.toContain('Khaadi');
    expect(brandNames).not.toContain('Sana Safinaz');
    expect(brandNames).not.toContain('Maria.B');
    expect(brandNames).not.toContain('Gul Ahmed');
    expect(brandNames).not.toContain('Asim Jofa');
    expect(brandNames).not.toContain('Baroque');
    expect(brandNames).not.toContain('Generation');

    // Should NOT include eyewear brands
    expect(brandNames).not.toContain('Ray-Ban');
    expect(brandNames).not.toContain('Oakley');

    // Every returned brand must have CAT-04 (Footwear) in categoryCodes
    shoeBrands.forEach((b) => {
      expect(b.categoryCodes).toContain('CAT-04');
    });
  });

  it('strictly applies to Recommended for You brands for Shoes', () => {
    const recommended = getRecommendedBrandsForCategory('shoes');
    expect(recommended.length).toBeGreaterThanOrEqual(10);

    const recNames = recommended.map((b) => b.name);
    expect(recNames).toContain('Nike');
    expect(recNames).toContain('Adidas');
    expect(recNames).toContain('Jordans');
    expect(recNames).toContain('New Balance');
    expect(recNames).toContain('Bata');
    expect(recNames).toContain('Servis');

    // Pure clothing or beauty brands must never be recommended for shoes
    expect(recNames).not.toContain('Khaadi');
    expect(recNames).not.toContain('Zara');
    expect(recNames).not.toContain('Huda Beauty');
    expect(recNames).not.toContain('Ray-Ban');

    recommended.forEach((brand) => {
      expect(brand.categoryCodes).toContain('CAT-04');
    });
  });

  it('strictly applies to Recommended for You brands for Beauty', () => {
    const recommended = getRecommendedBrandsForCategory('beauty');
    expect(recommended.length).toBeGreaterThan(0);

    const recNames = recommended.map((b) => b.name);
    expect(recNames).toContain('Huda Beauty');
    expect(recNames).toContain('MAC Cosmetics');
    expect(recNames).toContain('Sephora');
    expect(recNames).toContain('The Ordinary');

    // Shoes/clothing must not be recommended for beauty
    expect(recNames).not.toContain('Nike');
    expect(recNames).not.toContain('Bata');
    expect(recNames).not.toContain('Khaadi');

    recommended.forEach((brand) => {
      expect(brand.categoryCodes).toContain('CAT-07');
    });
  });

  it('strictly applies to Recommended for You brands for Bags', () => {
    const recommended = getRecommendedBrandsForCategory('bags');
    expect(recommended.length).toBeGreaterThan(0);

    const recNames = recommended.map((b) => b.name);
    expect(recNames).toContain('Louis Vuitton');
    expect(recNames).toContain('Coach');
    expect(recNames).toContain('Michael Kors');

    recommended.forEach((brand) => {
      expect(brand.categoryCodes).toContain('CAT-05');
    });
  });

  it('strictly returns clothing brands when Clothing category is selected', () => {
    const clothingBrands = getBrandsForCategory('clothing');
    const brandNames = clothingBrands.map((b) => b.name);

    expect(brandNames).toContain('Khaadi');
    expect(brandNames).toContain('Sapphire');
    expect(brandNames).toContain('Gul Ahmed');

    // Pure shoe/eyewear brands must not be in clothing
    expect(brandNames).not.toContain('Ray-Ban');
    expect(brandNames).not.toContain('Bata');
    expect(brandNames).not.toContain('Servis');
  });

  it('correctly maps category slug to taxonomy category codes', () => {
    expect(getCategoryCodesForSelection('shoes')).toEqual(['CAT-04']);
    expect(getCategoryCodesForSelection('clothing')).toEqual(['CAT-01', 'CAT-02', 'CAT-03']);
    expect(getCategoryCodesForSelection('bags')).toEqual(['CAT-05']);
    expect(getCategoryCodesForSelection('beauty')).toEqual(['CAT-07']);
  });

  it('verifies electronics category is completely removed', () => {
    const categoryIds = CATEGORIES.map((c) => c.id);
    expect(categoryIds).not.toContain('electronics');
    expect((CATEGORY_VALUES as readonly string[])).not.toContain('electronics');
  });

  it('correctly classifies eyewear with rootCategory as accessories', () => {
    const sunglassesResult = smartClassify('Ray-Ban Aviator Sunglasses');
    expect(sunglassesResult.suggestedCategories[0]).toMatchObject({
      code: 'CAT-05',
      rootCategory: 'accessories',
      subcategoryId: 'sunglasses',
    });

    const framesResult = smartClassify('Tom Ford Optical Frames');
    expect(framesResult.suggestedCategories[0]).toMatchObject({
      code: 'CAT-05',
      rootCategory: 'accessories',
      subcategoryId: 'eyeglasses',
    });
  });
});
