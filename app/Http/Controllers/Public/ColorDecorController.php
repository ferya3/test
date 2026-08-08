<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Color;
use App\Models\Decor;
use Illuminate\Contracts\View\View;

class ColorDecorController extends Controller
{
    public function __invoke(): View
    {
        return view('pages.colors-and-decor', [
            // Grouped by family so the page reads as a colour chart rather than
            // an undifferentiated wall of swatches.
            'colorFamilies' => Color::query()
                ->active()
                ->with('swatch')
                ->ordered()
                ->get()
                ->groupBy(fn (Color $color): string => $color->color_family?->value ?? 'other'),

            'decorFamilies' => Decor::query()
                ->active()
                ->with('sample')
                ->ordered()
                ->get()
                ->groupBy(fn (Decor $decor): string => $decor->decor_family?->value ?? 'other'),
        ]);
    }
}
